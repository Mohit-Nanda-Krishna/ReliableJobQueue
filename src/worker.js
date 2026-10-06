const { randomUUID } = require("crypto");
const { connectRedis, redisClient } = require("./config/redis");
const { checkQueueFormat } = require("./queue/queue");
const { startWorker } = require("./workers/worker");

function readInteger(name, fallback, minimum = 1) {
    const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
    if (process.env[name]?.trim() === "" || !Number.isInteger(value) || value < minimum || value > 2147483647) {
        throw new Error(`${name} must be an integer between ${minimum} and 2147483647`);
    }
    return value;
}

async function startWorkerProcess() {
    try {
        const workerId = randomUUID();
        const options = {
            jobTimeoutMs: readInteger("JOB_TIMEOUT_MS", 15000),
            recoveryIntervalMs: readInteger("RECOVERY_INTERVAL_MS", 5000),
            simulationDelayMs: readInteger("SIMULATED_PROCESSING_MS", 0, 0),
            simulatedFailuresBeforeSuccess: readInteger("SIMULATED_FAILURES_BEFORE_SUCCESS", 0, 0),
            retryBaseDelayMs: readInteger("RETRY_BASE_DELAY_MS", 1000),
            retryMaxDelayMs: readInteger("RETRY_MAX_DELAY_MS", 30000),
            retryPollIntervalMs: readInteger("RETRY_POLL_INTERVAL_MS", 500)
        };
        await connectRedis();
        await checkQueueFormat();
        startWorker(workerId, options);
        console.log(`Worker process started: ${workerId}`, options);
    } catch (error) {
        console.error("Unable to start worker process:", error);
        if (redisClient.isOpen) redisClient.destroy();
        process.exitCode = 1;
    }
}

startWorkerProcess();
