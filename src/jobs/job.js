const crypto = require("crypto");

function createJob(type, payload) {
    const now = Date.now();
    const job = {
        id: crypto.randomUUID(),
        type: type,
        payload: payload,
        status: "pending",
        createdAt: now,
        updatedAt: now
    };
    return job;
}

module.exports = {createJob};
