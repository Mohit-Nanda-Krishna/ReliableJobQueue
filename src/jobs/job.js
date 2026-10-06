const crypto = require("crypto");

function createJob(type, payload, maxAttempts = 3) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
        throw new Error("maxAttempts must be an integer between 1 and 10");
    }
    const now = Date.now();
    const job = {
        id: crypto.randomUUID(),
        type: type,
        payload: payload,
        status: "pending",
        attempts: 0,
        maxAttempts,
        createdAt: now,
        updatedAt: now
    };
    return job;
}

module.exports = {createJob};
