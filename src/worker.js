const { randomUUID } = require("crypto");
const { connectRedis, redisClient } = require("./config/redis");
const { checkQueueFormat } = require("./queue/queue");
const { startWorker } = require("./workers/worker");

function readMilliseconds(name, fallback, minimum = 1) {
    const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
    if (!Number.isInteger(value) || value < minimum || value > 2147483647) {
        throw new Error(`${name} must be an integer between ${minimum} and 2147483647`);
    }
    return value;
}

async function startWorkerProcess() {
    try {
        const workerId = randomUUID();
        const options = {
            jobTimeoutMs: readMilliseconds("JOB_TIMEOUT_MS", 15000),
            recoveryIntervalMs: readMilliseconds("RECOVERY_INTERVAL_MS", 5000),
            simulationDelayMs: readMilliseconds("SIMULATED_PROCESSING_MS", 0, 0)
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
