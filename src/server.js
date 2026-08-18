const express = require("express");
const app = express();
const {createJob} = require("./jobs/job");
app.use(express.json());

app.get("/health", (req, res) => {
    res.json({status: "ok"});
});

app.post("/jobs", (req, res) => {
    if(!req.body.type || !req.body.payload || typeof req.body.type !== "string" || typeof req.body.payload !== "object") {
        return res.status(400).json({error: "Missing type or payload or invalid type/payload"});
    }
   const job =createJob(req.body.type, req.body.payload);
   res.json(job);
});

app.listen(3000, ()=> {
    console.log("Server is running on port 3000");
});

