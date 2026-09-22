const { redisClient } = require("../config/redis");

const READY_QUEUE = "jobs:ready";
const PROCESSING_QUEUE = "jobs:processing";

async function enqueue(job) {
    await redisClient.lPush(
        READY_QUEUE,
        JSON.stringify(job)
    );
}

async function claimJob() {

    const rawJob = await redisClient.rPopLPush(
        READY_QUEUE,
        PROCESSING_QUEUE
    );

    if (!rawJob) {
        return null;
    }

    return {
        job: JSON.parse(rawJob),
        rawJob
    };
}

async function acknowledgeJob(rawJob) {

    await redisClient.lRem(
        PROCESSING_QUEUE,
        1,
        rawJob
    );
}

module.exports = {
    enqueue,
    claimJob,
    acknowledgeJob
};
