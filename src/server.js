const express = require("express");
const app = express();
const {createJob} = require("./jobs/job");
const { enqueue } = require("./queue/queue");
const { connectRedis } = require("./config/redis");

const port = process.env.PORT || 3000;

app.use(express.json());

app.get("/health", (req, res) => {
    res.json({status: "ok"});
});

app.post("/jobs",async (req, res) => {
    try {
        if(!req.body.type || !req.body.payload || typeof req.body.type !== "string" || typeof req.body.payload !== "object") {
            return res.status(400).json({error: "Missing type or payload or invalid type/payload"});
        }

        const job =createJob(req.body.type, req.body.payload);
        await enqueue(job);
        res.json(job);
    } catch (error) {
        console.error("Failed to enqueue job:", error);
        res.status(500).json({ error: "Unable to enqueue job" });
    }
});



async function startServer() {
    try {
        await connectRedis();

        const server = app.listen(port, () => {
            console.log(`API server is running on port ${port}`);
        });

        server.on("error", (error) => {
            console.error("API server failed to start:", error);
            process.exitCode = 1;
        });
    } catch (error) {
        console.error("Unable to connect API server to Redis:", error);
        process.exitCode = 1;
    }
}

startServer();
