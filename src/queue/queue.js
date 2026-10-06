const { randomUUID } = require("crypto");
const { redisClient } = require("../config/redis");
const { ENQUEUE, CLAIM, ACKNOWLEDGE, RECOVER } = require("./scripts");

const READY_QUEUE = "jobs:ready";
const PROCESSING_QUEUE = "jobs:processing";

async function enqueue(job) {
    await redisClient.eval(ENQUEUE, {
        keys: [READY_QUEUE, `job:${job.id}`],
        arguments: [job.id, job.type, JSON.stringify(job.payload), String(job.createdAt)]
    });
}

function deserializeJob(fields) {
    if (!fields.id) return null;
    const job = {
        ...fields,
        payload: JSON.parse(fields.payload),
        createdAt: Number(fields.createdAt),
        updatedAt: Number(fields.updatedAt)
    };
    if (fields.claimedAt) job.claimedAt = Number(fields.claimedAt);
    return job;
}

async function getJob(id) {
    return deserializeJob(await redisClient.hGetAll(`job:${id}`));
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

async function recoverStaleJobs(jobTimeoutMs) {
    const cutoff = Date.now() - jobTimeoutMs;
    // Bound each scan. Each script rechecks staleness because ACK/claim may run
    // between this query and recovery, or another worker may recover the same ID.
    const ids = await redisClient.zRangeByScore(PROCESSING_QUEUE, "-inf", `(${cutoff}`, {
        LIMIT: { offset: 0, count: 100 }
    });
    const recovered = [];
    for (const id of ids) {
        const result = await redisClient.eval(RECOVER, {
            keys: [READY_QUEUE, PROCESSING_QUEUE, `job:${id}`],
            arguments: [id, String(cutoff), String(Date.now())]
        });
        if (result === 1) {
            console.log(`Recovered stale job: ${id}`);
            recovered.push(id);
        }
    }
    return recovered;
}

async function checkQueueFormat() {
    const readyType = await redisClient.type(READY_QUEUE);
    const processingType = await redisClient.type(PROCESSING_QUEUE);
    if (!["none", "list"].includes(readyType) || !["none", "zset"].includes(processingType)) {
        throw new Error("Incompatible queue format. Stop Phase 1 processes and use a fresh Redis database via REDIS_URL; existing data was not changed.");
    }
    const oldestId = await redisClient.lIndex(READY_QUEUE, -1);
    if (oldestId && oldestId.startsWith("{")) {
        throw new Error("Phase 1 serialized jobs found. Stop Phase 1 processes and use a fresh Redis database via REDIS_URL; existing data was not changed.");
    }
}

module.exports = {
    enqueue,
    getJob,
    claimJob,
    acknowledgeJob,
    recoverStaleJobs,
    checkQueueFormat
};
