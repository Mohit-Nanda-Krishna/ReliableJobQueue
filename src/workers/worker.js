const { dequeue } = require("../queue/queue");

function processNextJob() {

    const job = dequeue();

    if (!job) {
        return;
    }

    job.status = "processing";
    console.log(`Processing job: ${job.id}`);
    job.status = "completed";
    console.log(`Completed job: ${job.id}`);

    return job;
}

function startWorker() {

    setInterval(() => {
        processNextJob();
    }, 1000);

}

module.exports = { processNextJob, startWorker };