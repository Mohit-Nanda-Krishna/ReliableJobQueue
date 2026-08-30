const express = require("express");
const app = express();
const {createJob} = require("./jobs/job");
const { enqueue, dequeue } = require("./queue/queue");
const { processNextJob, startWorker } = require("./workers/worker");
const { connectRedis } = require("./config/redis");

app.use(express.json());

app.get("/health", (req, res) => {
    res.json({status: "ok"});
});

app.post("/jobs",async (req, res) => {
    if(!req.body.type || !req.body.payload || typeof req.body.type !== "string" || typeof req.body.payload !== "object") {
        return res.status(400).json({error: "Missing type or payload or invalid type/payload"});
    }
   const job =createJob(req.body.type, req.body.payload);
   await enqueue(job);
   res.json(job);
});

app.get("/jobs/next", async (req, res) => {
    const job = await dequeue();

    if (!job) {
        return res.status(404).json({
            error: "No jobs available"
        });
    }

    res.json(job);
});

app.post("/jobs/process", (req, res) => {
    const job = processNextJob();

    if (!job) {
    return res.status(404).json({
        error: "No jobs available"
    });
    }
    res.json(job);
});



async function startServer() {
    await connectRedis();

    startWorker();

    app.listen(3000, () => {
        console.log("Server is running on port 3000");
    });
}

startServer();
