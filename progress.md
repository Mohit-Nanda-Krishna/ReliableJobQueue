Project Summary — Reliable Job Queue
1. Project name / one-sentence description

Reliable Job Queue — We are building a production-style backend job-processing system from scratch that accepts asynchronous jobs, queues them, processes them with workers, and reliably handles failures through retries and Dead Letter Queue recovery.

End goal

The final system should look roughly like:

                    ┌──────────────┐
                    │    Client    │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  API Server  │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  Job Queue   │
                    └──────┬───────┘
                           │
                ┌──────────┼──────────┐
                ▼          ▼          ▼
             Worker 1   Worker 2   Worker 3
                │          │          │
                └──────────┼──────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  PostgreSQL  │
                    └──────────────┘

                    ┌──────────────┐
                    │    Redis     │
                    └──────────────┘

                    ┌──────────────┐
                    │ Dead Letter  │
                    │    Queue     │
                    └──────────────┘

The goal isn't merely to make something that "works." The goal is for the user to understand why each component exists, what can go wrong, and how a reliable backend system handles those failures, while also being able to explain the design in interviews.

2. Full planned tech stack

The stack is being introduced progressively rather than dumping everything on Day 1.

Core language

JavaScript → TypeScript

We started with JavaScript because the user is learning backend development from scratch. The eventual project is intended to use TypeScript for stronger typing and maintainability.

Runtime

Node.js

Used to run JavaScript/TypeScript on the backend.

Backend framework

Express.js

Used for the HTTP API layer.

Current API examples:

GET  /health
POST /jobs
Primary database

PostgreSQL

Planned for persistent job storage and reliable state management.

It will eventually store things such as:

job ID
job type
payload
status
attempt count
timestamps
failure information
Queue / fast coordination layer

Redis

Planned for queue operations, fast state/coordination, worker coordination, and concurrency-related mechanisms.

Redis is not being introduced yet; it comes after we understand the basic queue ourselves.

Queue implementation

We are intentionally starting with a custom in-memory queue before introducing Redis.

This is pedagogical:

JavaScript data structure
        ↓
Understand queue mechanics
        ↓
Persistent queue
        ↓
Redis-backed coordination

Rather than hiding the important concepts behind an existing queue library.

Testing / API development

Postman

Currently being used to test:

POST /jobs

and send JSON request bodies.

Version control

Git

Used for local version history and incremental commits.

Remote repository

GitHub

The project is already connected to GitHub, and changes are pushed there.

Containerization

Docker

Planned for the later production-polish stage.

Observability

Planned:

Structured logging
Health checks
Metrics
Error tracking/visibility
Testing

Planned:

Unit tests
API/integration tests
Queue/worker behavior tests
Failure/retry tests
Concurrency-related tests
3. Full roadmap / phases

We laid out approximately 10 phases, with an expected total of roughly 6–8 weeks at around 1.5–3 hours/day, 5 days/week. Since this is being done alongside college, it can naturally stretch to 2–3 months without being a problem.

The important part is that each phase is broken into small daily tasks.

Phase 1 — Backend & Project Foundation
Covers
Node.js fundamentals
Express
HTTP
APIs
Request/response
GET vs POST
JSON
Git
GitHub
Project structure
Goal

Have a functioning backend repository that can receive API requests.

Status

Completed / mostly completed.

Phase 2 — Job System
Covers
What a job actually is
Job representation
Job IDs
Job type
Job payload
Job status
Job creation
Input validation
Separation of concerns
Goal

Turn:

POST /jobs

into an actual structured Job object.

Status

Currently here — essentially Day 2.

Phase 3 — Queue Engine
Covers
What a queue actually is
FIFO behavior
Enqueue
Dequeue
Queue state
In-memory queue
Job lifecycle
Queue APIs
Handling an empty queue
Goal

Instead of:

POST /jobs
    ↓
Create job
    ↓
Return job
    ↓
Gone

we get:

POST /jobs
    ↓
Create job
    ↓
QUEUE
    ├── Job 1
    ├── Job 2
    └── Job 3
Phase 4 — Workers
Covers
Worker concept
Background processing
Async JavaScript
Worker lifecycle
Polling / job retrieval
Processing jobs
Multiple workers
Worker pools
Basic concurrency concepts
Goal

Move from simply storing jobs to actually processing them.

Queue
  ↓
Worker
  ↓
Process job
  ↓
Complete

Eventually:

Queue
 ├── Worker 1
 ├── Worker 2
 └── Worker 3
Phase 5 — Reliability & Failure Handling
Covers
What happens when jobs fail
ACK/NACK concepts
Retry behavior
Retry limits
Failure states
Exponential backoff
Temporary vs permanent failures
Worker failures
Crash scenarios
Goal

A failed job should not simply disappear.

Example:

Job
 ↓
Worker
 ↓
FAIL
 ↓
Retry
 ↓
Retry
 ↓
Retry
 ↓
Success
Phase 6 — Dead Letter Queue
Covers
Dead Letter Queue / DLQ
Maximum retry attempts
Permanently failed jobs
Recovery
Inspecting failed jobs
Reprocessing failed jobs
Goal

When a job repeatedly fails:

Queue
 ↓
Worker
 ↓
Failure
 ↓
Retry 1
 ↓
Retry 2
 ↓
Retry 3
 ↓
DLQ

The job isn't silently lost.

Phase 7 — Persistence with PostgreSQL
Covers
PostgreSQL fundamentals
Database schema
Tables
SQL
Job persistence
Job state persistence
Transactions
Atomic operations
Crash recovery
Database-backed reliability
Goal

Move beyond temporary in-memory state.

Currently:

Server restart
    ↓
Everything disappears

Eventually:

Server restart
    ↓
PostgreSQL still has jobs
    ↓
System can recover
Phase 8 — Redis & Concurrency
Covers
Redis
Redis data structures
Queue coordination
Multiple workers
Race conditions
Locks
Atomic operations
Concurrent job processing
Preventing multiple workers from incorrectly claiming the same job
Goal

Make the system behave more like a real distributed backend rather than a single-process toy.

This is where concepts such as concurrency safety and duplicate processing become much more important.

Phase 9 — Production Features
Covers
Input validation
Error handling
Logging
Metrics
Health checks
Automated testing
API robustness
Configuration
Environment variables
Failure visibility
Goal

Turn the project from:

"It works on my laptop."

into:

"I can actually operate and test this system."

Phase 10 — Production Polish / Deployment / Interview Readiness
Covers
Docker
Containerized services
PostgreSQL + Redis + application
Deployment
Architecture documentation
README
API documentation
System diagrams
Performance considerations
Testing
Git history cleanup
Interview questions
System design explanation
Final goal

Be able to show the project on GitHub and explain the architecture end-to-end.

4. Current phase and exactly what has been built
Current phase

Phase 2 — Job System

More specifically, we are at the end of Day 2.

The user started Day 1 knowing essentially none of the backend concepts involved and is being taught each concept incrementally.

Current project structure

At the moment, the project looks approximately like:

reliable-job-queue/
│
├── src/
│   ├── server.js
│   │
│   └── jobs/
│       └── job.js
│
├── .gitignore
├── package.json
├── package-lock.json
└── .git/

node_modules/ also exists locally but is excluded from Git through .gitignore.

What server.js currently does

The server:

1. Creates an Express application
const express = require("express");

const app = express();
2. Enables JSON request parsing
app.use(express.json());

This allows JSON request bodies to be accessed through:

req.body
3. Has a health endpoint
GET /health

which returns:

{
  "status": "ok"
}
4. Has a job creation endpoint
POST /jobs

The endpoint receives a JSON body.

Example:

{
  "type": "send_email",
  "payload": {
    "to": "test@example.com"
  }
}
5. Validates the job type

The current implementation checks that:

type exists
AND
type is a string

Invalid requests return:

HTTP 400

with an error message.

6. Creates a Job

The API calls:

createJob(req.body.type, req.body.payload);

and returns the resulting Job object.

What job.js currently does

The current implementation is:

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

module.exports = { createJob };

This means every newly created job receives:

Unique ID

Generated using:

crypto.randomUUID()
Type

For example:

send_email
Payload

For example:

{
  "to": "test@example.com"
}
Initial status
pending
What has actually been tested

The user has successfully tested:

Health endpoint
GET /health

and confirmed the server responds correctly.

Job endpoint
POST /jobs

with JSON such as:

{
  "type": "send_email",
  "payload": {
    "to": "test@example.com"
  }
}

and the server successfully returns a generated Job object containing:

id
type
payload
status: pending
Invalid input

We also introduced validation and discussed/testing the intended behavior for invalid input such as:

{}

and:

{
  "type": 123
}

These should produce:

400 Bad Request

rather than creating invalid jobs.

Debugging experience so far

The user encountered their first backend runtime error:

ReferenceError: consle is not defined

because of a typo:

consle.log(...)

instead of:

console.log(...)

This caused the /jobs request to return:

500 Internal Server Error

We diagnosed the difference between:

400 = invalid client request
500 = server-side error

and fixed the issue.

That was intentionally treated as a real debugging exercise rather than simply replacing the code without explanation.

Git/GitHub status

Git is already initialized.

The user has:

git init

created the repository.

They learned:

git status
git add .
git commit
git log

They created their first commit:

Initial Express server

A GitHub repository called:

reliable-job-queue

was created.

The local repository was connected to GitHub using origin.

The main branch was established, and the initial project was successfully pushed to GitHub.

The user understands the basic distinction between:

git commit

and:

git push
5. Technical concepts learned so far

Important distinction: we have NOT yet implemented advanced reliability mechanisms.

The following concepts have been introduced so far.

Node.js

Node.js runs JavaScript outside the browser.

Used as our backend runtime.

Express

Express provides the HTTP server/API layer.

HTTP request/response

The user understands the basic model:

Client
 ↓ request
Server
 ↓ response
Client
GET vs POST

Current understanding:

GET /health

retrieves information.

POST /jobs

submits data / creates a job.

JSON request body

Clients send data such as:

{
  "type": "send_email",
  "payload": {}
}

Express parses it using:

app.use(express.json());

and the application accesses it through:

req.body
Job representation

A job is understood as:

A piece of work that needs to be performed by the system, represented as structured data.

Current representation:

id
type
payload
status
Unique job IDs

Implemented with:

crypto.randomUUID()

This allows individual jobs to be tracked later.

Job status

Currently implemented only as:

pending

but the lifecycle has been conceptually introduced:

pending
   ↓
processing
   ↓
completed

and:

processing
   ↓
failed

Retry and DLQ behavior will be implemented later.

Input validation

Implemented basic server-side validation:

type must exist
type must be a string

Invalid input returns:

400 Bad Request

The reasoning learned:

Never rely solely on client-side validation because clients can send arbitrary requests.

HTTP error semantics

The user has learned the distinction between:

400 → bad client request
500 → unexpected server-side failure
Separation of concerns

The Job creation logic was moved from server.js into:

src/jobs/job.js

This gives us:

server.js
    ↓
HTTP/API responsibility

job.js
    ↓
job creation responsibility

This will become increasingly important as the system grows.

Node modules

The user has learned the basic idea behind:

require(...)

and:

module.exports

allowing functionality to be separated across files.

Concepts NOT implemented yet

This is important because the project is still very early.

We have not yet implemented:

Actual queue storage
FIFO queue
Worker processing
Multiple workers
Worker concurrency
Retry mechanism
Exponential backoff
ACK/NACK
Idempotency
Delivery guarantees
Duplicate-job handling
At-least-once delivery
Exactly-once semantics
PostgreSQL persistence
Redis
Distributed locking
Race-condition prevention
Dead Letter Queue
Crash recovery
Transactions
Metrics
Production logging
Docker
Deployment

These are future milestones.

6. Design decisions made so far
Decision 1 — Build the queue ourselves before using Redis

We're intentionally not starting with Redis.

Reason:

If we immediately use an existing queue implementation, the user could build something functional without understanding:

enqueue
dequeue
FIFO
worker claiming
job state
failure
retry

Instead:

Understand queue
      ↓
Implement queue in memory
      ↓
Understand its limitations
      ↓
Introduce Redis
      ↓
Understand why Redis helps

This makes the eventual architecture easier to explain in an interview.

Decision 2 — PostgreSQL for persistent job state

PostgreSQL is planned as the persistent database.

Reason:

A reliable job system needs durable state.

An in-memory queue has a fundamental limitation:

Server crashes
     ↓
Memory disappears
     ↓
Jobs disappear

PostgreSQL will eventually provide durable storage and transactional behavior.

Decision 3 — Redis as a coordination/fast queue layer

Redis is planned later for fast queue operations and worker coordination.

The exact division between PostgreSQL and Redis will be designed when we reach that phase rather than prematurely locking ourselves into a complicated architecture.

Decision 4 — Dead Letter Queue instead of infinite retries

We will eventually impose a retry limit.

Conceptually:

Failure
 ↓
Retry 1
 ↓
Retry 2
 ↓
Retry 3
 ↓
DLQ

Reason:

Some failures are permanent. Retrying forever wastes resources and can create an endless failure loop.

Decision 5 — Incremental architecture

We're deliberately avoiding building everything immediately.

The project evolves:

Express API
    ↓
Job model
    ↓
In-memory queue
    ↓
Worker
    ↓
Retries
    ↓
DLQ
    ↓
PostgreSQL
    ↓
Redis
    ↓
Concurrency
    ↓
Productionization

The reasoning is educational and architectural: each layer solves a limitation introduced by the previous one.

7. What's still left to build
Immediate next milestone — Phase 3
Build the actual queue

We'll create something conceptually like:

Queue
├── Job A
├── Job B
└── Job C

and implement operations such as:

enqueue(job)
dequeue()

The user will learn:

FIFO
queue state
empty queues
in-memory data structures
why a queue is different from simply storing objects
Then — Workers

We'll make a worker actually consume jobs:

POST /jobs
     ↓
Queue
     ↓
Worker
     ↓
Process

Then eventually:

Queue
 ├── Worker 1
 ├── Worker 2
 └── Worker 3
Then — Reliability

We'll intentionally make jobs fail.

That allows us to build:

failure
 ↓
retry
 ↓
backoff
 ↓
retry limit

and learn why each mechanism is necessary.

Then — Dead Letter Queue

Eventually:

Job
 ↓
Worker
 ↓
Failure
 ↓
Retry
 ↓
Retry
 ↓
Retry
 ↓
DLQ

We'll also eventually need a mechanism for inspecting and reprocessing dead jobs.

Then — PostgreSQL

We'll introduce persistent job storage and learn:

SQL
schema design
transactions
durability
state transitions
crash recovery
Then — Redis

We'll introduce Redis after the conceptual queue is understood.

We'll investigate:

fast queue operations
worker coordination
locks
atomicity
concurrency
Then — concurrency and distributed behavior

This is where the project becomes much more interesting technically.

We'll investigate problems such as:

Worker 1 ──┐
           ├──> same job?
Worker 2 ──┘

and learn how systems prevent incorrect simultaneous processing.

This is where concepts such as:

Race conditions
Locks
Atomic operations
Duplicate processing
Idempotency
Delivery semantics

will become concrete rather than theoretical vocabulary.

Finally — productionization

We'll add:

Tests
Logging
Metrics
Health checks
Environment configuration
Docker
Deployment
Documentation
Architecture diagram

and prepare the project for GitHub/resume/interview presentation.

Overall mentoring workflow

The project is intentionally being treated like a long-term senior-engineer mentorship, not like a tutorial where AI dumps the finished code.

For each feature, the workflow is:

1. Learn the concept
        ↓
2. Understand why we need it
        ↓
3. Design the solution
        ↓
4. User implements it
        ↓
5. Debug problems together
        ↓
6. Review the implementation
        ↓
7. Test it
        ↓
8. Commit to Git
        ↓
9. Interview questions
        ↓
10. Move to next feature

The user explicitly wants to write the project themselves rather than have AI generate the entire thing, while still getting step-by-step explanations and syntax guidance because they're learning the backend concepts from scratch.

For every significant module/feature, the mentoring also includes an Interview Corner covering:

likely interview questions,
what the interviewer is actually testing,
the reasoning behind the answer,
and a concise answer the user should eventually be able to explain in their own words.
Current one-line status

We're at the end of Day 2: a Node.js/Express backend is running, GitHub is connected, POST /jobs accepts and validates JSON, creates uniquely identified pending Job objects through a separate job.js module, and returns them successfully; Day 3 begins by turning those ephemeral jobs into an actual queue.

Today 1:14 AM
lets start day 3 also lets create a file progress.md that u make me update after every session to have progress if incase this chat window limit exhausts also lets move a bit not just stay stagnant
Memory updated

Data analysis isn't available right now. Do you want to continue without it? 

yeah ok

Yep. We're good — and progress.md is now created.

Download progress.md

From now on, this is part of our workflow: at the end of every session, we update it with what we built, files, tests, concepts, interview points, and exactly what comes next. If this chat dies from context limits, we can use that file to recover the project state instead of starting over.

🚀 Day 3 — Let's actually build the queue

And yes, I agree with you: we need to move. We've spent two days on foundations; today we're making the first actual piece of the queue system.

Today's target

Currently:

POST /jobs
     ↓
createJob()
     ↓
return job
     ↓
💨 gone

Today:

POST /jobs
     ↓
createJob()
     ↓
QUEUE
 ┌───────────────┐
 │ Job 1         │
 │ Job 2         │
 │ Job 3         │
 └───────────────┘

That's our first real queue.

Step 1 — What is a queue?

You've probably seen this in DSA.

A queue follows:

FIFO — First In, First Out

Think of people standing in a line:

Person A → Person B → Person C
   ↑
 first

A gets served first.

For jobs:

Job A → Job B → Job C
  ↓
processed first

So if we add:

A
B
C

and dequeue three times, we MUST get:

A
B
C

not:

C
B
A
Step 2 — Where do we store it?

For now, we're going to use a JavaScript array.

Create:

src/queue/
    queue.js

So our project becomes:

src/
├── server.js
├── jobs/
│   └── job.js
└── queue/
    └── queue.js

And inside queue.js, we'll eventually have something conceptually like:

const queue = [];

That's literally our queue for now.

Why are we doing this?

Because I want you to understand the mechanics before Redis enters the picture.

Later we'll be able to say:

"We initially implemented the queue in memory, but this has durability and multi-instance limitations, which is why we eventually moved coordination/persistence to Redis/PostgreSQL."

That's a much better engineering story than:

"I installed Redis because ChatGPT told me to." 😂

Your first Day 3 task

Create:

src/queue/queue.js

and put only this inside:

const queue = [];

Don't implement enqueue/dequeue yet.

Then tell me done.

Next I'll teach you exactly how we're going to make:

enqueue(job)
dequeue()

and you'll implement them yourself.

progress.md
Document

# Reliable Job Queue — Progress

## Current Phase
Phase 3 — Reliable Redis Job Processing

## Completed

### Phase 1 — Basic Queue
- Express server created
- `POST /jobs` endpoint implemented
- Job creation using `crypto.randomUUID()`
- In-memory FIFO queue implemented
- Worker implemented
- Automatic worker loop implemented
- Job lifecycle: `pending → processing → completed`

### Phase 2 — Redis Migration
- Docker Desktop installed and configured
- Redis running inside a Docker container
- Node.js connected to Redis using the `redis` npm package
- Redis List used as the queue
- FIFO implemented using `LPUSH + RPOP`
- JavaScript array queue replaced with Redis-backed queue

### Phase 3 — Reliable Job Claiming
- Added separate Redis ready and processing queues
- `jobs:ready` stores jobs waiting for processing
- `jobs:processing` stores jobs currently being processed
- Implemented atomic job claiming using `RPOPLPUSH`
- Worker now claims jobs instead of permanently removing them
- Added job acknowledgement after successful processing
- Successfully processed jobs are removed from the processing queue
- Tested worker failure scenario: a claimed job remains in `jobs:processing` if the worker fails before acknowledgement

## Current Architecture

Client
  ↓
Express API
  ↓
Redis `jobs:ready`
  ↓
Atomic job claim
  ↓
Redis `jobs:processing`
  ↓
Worker
  ↓
Successful completion
  ↓
Acknowledgement
  ↓
Remove from processing

## Concepts Learned
- Redis
- Docker
- Docker images vs containers
- Redis Lists
- FIFO queues
- Atomic operations
- Job claiming
- In-flight/processing jobs
- Acknowledgement
- Worker failure window
- At-least-once processing implications

## Current Limitations
- Stale jobs in `jobs:processing` are not automatically recovered yet
- No retry mechanism
- No retry count
- No exponential backoff
- No Dead Letter Queue
- No PostgreSQL persistence
- No idempotency protection
- No multi-worker concurrency testing yet
- Basic queue metadata still needs to be improved

## Next Milestone
Implement stale-job detection and recovery:
1. Track worker/job claim metadata
2. Detect jobs stuck in processing
3. Requeue stale jobs
4. Introduce retry attempts
5. Add exponential backoff
6. Eventually route permanently failing jobs to a Dead Letter Queue

## Interview Focus
- Why Redis instead of an in-memory array?
- Why Redis instead of PostgreSQL?
- Why use a Redis List?
- Why does `LPUSH + RPOP` provide FIFO?
- Why must job claiming be atomic?
- What is an in-flight job?
- What is acknowledgement?
- What happens if a worker crashes after claiming a job?
- Why can recovery result in duplicate execution?
- Why is exactly-once processing difficult?