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

    setInterval(async () => {
        await processNextJob();
    }, 1000);

}

module.exports = {
    processNextJob,
    startWorker
};