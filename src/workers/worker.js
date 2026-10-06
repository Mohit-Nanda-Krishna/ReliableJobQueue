const {
    claimJob,
    acknowledgeJob,
    failJob,
    recoverStaleJobs,
    promoteRetries
} = require("../queue/queue");
const { setTimeout: delay } = require("node:timers/promises");

async function processNextJob(workerId, {
    simulationDelayMs = 0,
    simulatedFailuresBeforeSuccess = 0,
    retryBaseDelayMs = 1000,
    retryMaxDelayMs = 30000
} = {}) {
    const job = await claimJob(workerId);
    if (!job) {
        return;
    }

    console.log(`Worker ${workerId} processing job: ${job.id}, attempt: ${job.attempts}`);

    // Optional delay gives a developer time to kill this process before ACK.
    // It is not a heartbeat: a live but slow worker can also lose its claim.
    try {
        // Development/testing handler. The default never deliberately fails.
        if (simulationDelayMs > 0) await delay(simulationDelayMs);
        if (job.attempts <= simulatedFailuresBeforeSuccess) {
            throw new Error("Simulated job failure");
        }
    } catch (error) {
        if (!await failJob(job, error, retryBaseDelayMs, retryMaxDelayMs)) {
            console.warn(`Skipped failure for job ${job.id}: claim is no longer owned by worker ${workerId}`);
        }
        return;
    }

    // ACK/network errors are not handler failures. An unconfirmed claim is
    // left for recovery; never turn an uncertain ACK into a processing failure.
    if (await acknowledgeJob(job)) {
        console.log(`Completed job: ${job.id}, attempt: ${job.attempts}`);
    } else {
        console.warn(`Skipped ACK for job ${job.id}: claim is no longer owned by worker ${workerId}`);
    }
}

function startWorker(workerId, options) {
    const { jobTimeoutMs, recoveryIntervalMs, retryBaseDelayMs, retryMaxDelayMs, retryPollIntervalMs } = options;
    let isProcessing = false;
    let isRecovering = false;
    let isPromoting = false;

    const processingTimer = setInterval(() => {
        if (isProcessing) {
            return;
        }

        isProcessing = true;

        processNextJob(workerId, options)
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
        recoverStaleJobs(jobTimeoutMs, retryBaseDelayMs, retryMaxDelayMs)
            .catch((error) => {
                console.error("Failed to recover stale jobs:", error);
            })
            .finally(() => {
                isRecovering = false;
            });
    }, recoveryIntervalMs);

    const retryTimer = setInterval(() => {
        if (isPromoting) return;
        isPromoting = true;
        promoteRetries()
            .catch((error) => {
                console.error("Failed to promote retries:", error);
            })
            .finally(() => {
                isPromoting = false;
            });
    }, retryPollIntervalMs);

    return { processingTimer, recoveryTimer, retryTimer };
}

module.exports = {
    processNextJob,
    startWorker
};
