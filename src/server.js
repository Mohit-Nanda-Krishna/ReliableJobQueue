const express = require("express");
const app = express();
const {createJob} = require("./jobs/job");
const { enqueue, dequeue } = require("./queue/queue");
const { processNextJob, startWorker } = require("./workers/worker");

app.use(express.json());

app.get("/health", (req, res) => {
    res.json({status: "ok"});
});

app.post("/jobs", (req, res) => {
    if(!req.body.type || !req.body.payload || typeof req.body.type !== "string" || typeof req.body.payload !== "object") {
        return res.status(400).json({error: "Missing type or payload or invalid type/payload"});
    }
   const job =createJob(req.body.type, req.body.payload);
   enqueue(job);
   res.json(job);
});

app.get("/jobs/next", (req, res) => {
    const job = dequeue();

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

startWorker();

app.listen(3000, ()=> {
    console.log("Server is running on port 3000");
});

