const crypto = require("crypto");

function createJob(type, payload) {
    const job = {
        id: crypto.randomUUID(),
        type: type,
        payload: payload,
        status: "pending"
    };
    return job;
}

module.exports = {createJob};