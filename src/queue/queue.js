const { randomUUID } = require("crypto");
const { redisClient } = require("../config/redis");
const { ENQUEUE, CLAIM, ACKNOWLEDGE, FAIL, RECOVER, PROMOTE_RETRY } = require("./scripts");

const READY_QUEUE = "jobs:ready";
const PROCESSING_QUEUE = "jobs:processing";
const RETRY_QUEUE = "jobs:retry";
const DEAD_QUEUE = "jobs:dead";

async function enqueue(job) {
    await redisClient.eval(ENQUEUE, {
        keys: [READY_QUEUE, `job:${job.id}`],
        arguments: [job.id, job.type, JSON.stringify(job.payload), String(job.createdAt), String(job.maxAttempts)]
    });
}

function deserializeJob(fields) {
    if (Object.keys(fields).length === 0) return null;
    if (!fields.id) throw new Error("Job hash is missing its ID");
    const job = {
        ...fields,
        payload: JSON.parse(fields.payload)
    };
    for (const name of ["createdAt", "updatedAt", "attempts", "maxAttempts", "claimedAt", "nextRetryAt", "failedAt"]) {
        const optional = ["claimedAt", "nextRetryAt", "failedAt"].includes(name);
        if (optional && fields[name] === undefined) continue;
        const value = Number(fields[name]);
        if (fields[name]?.trim() === "" || !Number.isSafeInteger(value) || value < 0) {
            throw new Error(`Job ${fields.id} has invalid ${name}`);
        }
        job[name] = value;
    }
    if (job.maxAttempts < 1 || job.maxAttempts > 10 || job.attempts > job.maxAttempts) {
        throw new Error(`Job ${fields.id} has invalid attempt limits`);
    }
    return job;
}

async function getJob(id) {
    return deserializeJob(await redisClient.hGetAll(`job:${id}`));
}

async function getDeadJobIds() {
    return redisClient.lRange(DEAD_QUEUE, 0, 99);
}

async function claimJob(workerId) {
    // A fresh token identifies this claim, even if the same worker later reclaims it.
    const fields = await redisClient.eval(CLAIM, {
        keys: [READY_QUEUE, PROCESSING_QUEUE],
        arguments: [String(Date.now()), workerId, randomUUID()]
    });
    if (!fields) return null;
    const job = {};
    for (let i = 0; i < fields.length; i += 2) {
        job[fields[i]] = fields[i + 1];
    }
    return deserializeJob(job);
}

async function acknowledgeJob(job) {
    const acknowledged = await redisClient.eval(ACKNOWLEDGE, {
        keys: [PROCESSING_QUEUE, `job:${job.id}`],
        arguments: [job.id, job.workerId, job.claimToken, String(Date.now())]
    });
    return acknowledged === 1;
}

function logFailure(id, result, lastError) {
    if (!result) return null;
    const [status, attempts, nextRetryAt] = result;
    if (status === "dead") {
        console.log(`Dead-lettered job: ${id}, attempts: ${attempts}, error: ${lastError}`);
        return { id, status, attempts, lastError };
    }
    console.log(`Failure scheduled: ${id}, attempt: ${attempts}, nextRetryAt: ${nextRetryAt}, error: ${lastError}`);
    return { id, status, attempts, nextRetryAt, lastError };
}

async function failJob(job, error, retryBaseDelayMs = 1000, retryMaxDelayMs = 30000) {
    const lastError = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
    const result = await redisClient.eval(FAIL, {
        keys: [PROCESSING_QUEUE, RETRY_QUEUE, DEAD_QUEUE, `job:${job.id}`],
        arguments: [job.id, String(Date.now()), lastError, String(retryBaseDelayMs),
            String(retryMaxDelayMs), job.workerId, job.claimToken]
    });
    return logFailure(job.id, result, lastError);
}

async function recoverStaleJobs(jobTimeoutMs, retryBaseDelayMs = 1000, retryMaxDelayMs = 30000) {
    const cutoff = Date.now() - jobTimeoutMs;
    // Bound each scan. Each script rechecks staleness because ACK/claim may run
    // between this query and recovery, or another worker may recover the same ID.
    const ids = await redisClient.zRangeByScore(PROCESSING_QUEUE, "-inf", `(${cutoff}`, {
        LIMIT: { offset: 0, count: 100 }
    });
    const recovered = [];
    for (const id of ids) {
        const result = await redisClient.eval(RECOVER, {
            keys: [PROCESSING_QUEUE, RETRY_QUEUE, DEAD_QUEUE, `job:${id}`],
            arguments: [id, String(Date.now()), "worker claim expired", String(retryBaseDelayMs),
                String(retryMaxDelayMs), String(cutoff)]
        });
        if (result) {
            console.log(`Recovered stale job: ${id}`);
            logFailure(id, result, "worker claim expired");
            recovered.push(id);
        }
    }
    return recovered;
}

async function promoteRetries() {
    const ids = await redisClient.zRangeByScore(RETRY_QUEUE, "-inf", Date.now(), {
        LIMIT: { offset: 0, count: 100 }
    });
    const promoted = [];
    for (const id of ids) {
        const result = await redisClient.eval(PROMOTE_RETRY, {
            keys: [READY_QUEUE, RETRY_QUEUE, `job:${id}`],
            arguments: [id, String(Date.now())]
        });
        if (result === 1) {
            console.log(`Retry promoted: ${id}`);
            promoted.push(id);
        }
    }
    return promoted;
}

async function checkQueueFormat() {
    for (const [key, expectedType] of [[READY_QUEUE, "list"], [PROCESSING_QUEUE, "zset"],
        [RETRY_QUEUE, "zset"], [DEAD_QUEUE, "list"]]) {
        const type = await redisClient.type(key);
        if (type !== "none" && type !== expectedType) {
            throw new Error(`Incompatible queue format: ${key} must be a ${expectedType}; existing data was not changed.`);
        }
    }
    const oldestId = await redisClient.lIndex(READY_QUEUE, -1);
    if (oldestId && oldestId.startsWith("{")) {
        throw new Error("Phase 1 serialized jobs found. Stop Phase 1 processes and use a fresh Redis database via REDIS_URL; existing data was not changed.");
    }
}

module.exports = {
    enqueue,
    getJob,
    getDeadJobIds,
    claimJob,
    acknowledgeJob,
    failJob,
    recoverStaleJobs,
    promoteRetries,
    checkQueueFormat
};
