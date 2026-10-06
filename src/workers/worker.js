const {
    claimJob,
    acknowledgeJob,
    recoverStaleJobs
} = require("../queue/queue");
const { setTimeout: delay } = require("node:timers/promises");

async function processNextJob(workerId, simulationDelayMs = 0) {
    const job = await claimJob(workerId);
    if (!job) {
        return;
    }

    console.log(`Worker ${workerId} processing job: ${job.id}`);

    // Optional delay gives a developer time to kill this process before ACK.
    // It is not a heartbeat: a live but slow worker can also lose its claim.
    if (simulationDelayMs > 0) await delay(simulationDelayMs);

    if (await acknowledgeJob(job)) {
        console.log(`Completed job: ${job.id}`);
    } else {
        console.warn(`Skipped ACK for job ${job.id}: claim is no longer owned by worker ${workerId}`);
    }
}

function startWorker(workerId, { jobTimeoutMs, recoveryIntervalMs, simulationDelayMs }) {
    let isProcessing = false;
    let isRecovering = false;

    const processingTimer = setInterval(() => {
        if (isProcessing) {
            return;
        }

        isProcessing = true;

        processNextJob(workerId, simulationDelayMs)
            .catch((error) => {
                console.error("Failed to process job:", error);
            })
            .finally(() => {
                isProcessing = false;
            });
    }, 1000);

    // Recovery runs independently, including while this worker is busy.
    const recoveryTimer = setInterval(() => {
        if (isRecovering) return;
        isRecovering = true;
        recoverStaleJobs(jobTimeoutMs)
            .catch((error) => {
                console.error("Failed to recover stale jobs:", error);
            })
            .finally(() => {
                isRecovering = false;
            });
    }, recoveryIntervalMs);

    return { processingTimer, recoveryTimer };
}

module.exports = {
    processNextJob,
    startWorker
};
