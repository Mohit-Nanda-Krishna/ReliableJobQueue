const express = require("express");
const app = express();
const { createJob } = require("./jobs/job");
const { enqueue, getJob, checkQueueFormat } = require("./queue/queue");
const { connectRedis, redisClient } = require("./config/redis");

const port = process.env.PORT || 3000;

app.use(express.json());

app.get("/health", (req, res) => {
    res.json({status: "ok"});
});

app.post("/jobs", async (req, res) => {
    try {
        if (!req.body || !req.body.type || !req.body.payload || typeof req.body.type !== "string" || typeof req.body.payload !== "object") {
            return res.status(400).json({error: "Missing type or payload or invalid type/payload"});
        }

        const job = createJob(req.body.type, req.body.payload);
        await enqueue(job);
        res.json(job);
    } catch (error) {
        console.error("Failed to enqueue job:", error);
        res.status(500).json({ error: "Unable to enqueue job" });
    }
});

app.get("/jobs/:id", async (req, res) => {
    try {
        const job = await getJob(req.params.id);
        if (!job) return res.status(404).json({ error: "Job not found" });
        // The claim token is internal ownership metadata, not part of the API.
        delete job.claimToken;
        res.json(job);
    } catch (error) {
        console.error("Failed to read job:", error);
        res.status(500).json({ error: "Unable to read job" });
    }
});

async function startServer() {
    try {
        await connectRedis();
        await checkQueueFormat();

        const server = app.listen(port, () => {
            console.log(`API server is running on port ${port}`);
        });

        server.on("error", (error) => {
            console.error("API server failed to start:", error);
            if (redisClient.isOpen) redisClient.destroy();
            process.exitCode = 1;
        });
    } catch (error) {
        console.error("Unable to start API server:", error);
        if (redisClient.isOpen) redisClient.destroy();
        process.exitCode = 1;
    }
}

startServer();
