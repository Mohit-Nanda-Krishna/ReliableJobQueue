const {
    claimJob,
    acknowledgeJob
} = require("../queue/queue");

async function processNextJob() {

    const result = await claimJob();

    if (!result) {
        return;
    }

    const { job, rawJob } = result;

    console.log(`Processing job: ${job.id}`);

    job.status = "processing";

    // Simulated job processing
    job.status = "completed";

    await acknowledgeJob(rawJob);

    console.log(`Completed job: ${job.id}`);

    return job;
}

function startWorker() {
    let isProcessing = false;

    return setInterval(() => {
        if (isProcessing) {
            return;
        }

        isProcessing = true;

        processNextJob()
            .catch((error) => {
                console.error("Failed to process job:", error);
            })
            .finally(() => {
                isProcessing = false;
            });
    }, 1000);

}

module.exports = {
    processNextJob,
    startWorker
};
