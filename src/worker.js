const { connectRedis } = require("./config/redis");
const { startWorker } = require("./workers/worker");

async function startWorkerProcess() {
    try {
        await connectRedis();
        startWorker();
        console.log("Worker process started");
    } catch (error) {
        console.error("Unable to start worker process:", error);
        process.exitCode = 1;
    }
}

startWorkerProcess();
