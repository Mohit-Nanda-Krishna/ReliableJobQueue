# Reliable Job Queue

A learning project using JavaScript/CommonJS, Express, and a custom Redis queue.
Phase 2 adds persisted job state and recovery of abandoned worker claims.

## Run locally

Requires Node.js 20+ and an already-running standalone Redis server.

```powershell
npm install
```

Stop all Phase 1 API/worker processes first. Phase 1 stored serialized jobs in
lists; Phase 2 uses IDs, hashes, and a sorted set. There is no automatic migration
or deletion of old data. Use an empty Redis database dedicated to this project.
The commands below use database 1; choose another unused database if 1 contains
existing data. Set the same URL in every terminal. Do not run old and new workers
against the same database.

API terminal:

```powershell
$env:REDIS_URL = 'redis://localhost:6379/1'
$env:PORT = '3000'
npm run start:api
```

Worker terminal:

```powershell
$env:REDIS_URL = 'redis://localhost:6379/1'
$env:JOB_TIMEOUT_MS = '15000'
$env:RECOVERY_INTERVAL_MS = '5000'
$env:SIMULATED_PROCESSING_MS = '0'
npm run start:worker
```

Defaults: Redis database 0 at `redis://localhost:6379`, port 3000, timeout 15000 ms,
recovery interval 5000 ms, simulation delay 0 ms. Worker polling runs every second.
Use the same timeout on all workers. Timing settings must be integers; timeout
and interval must be positive, and simulation delay may be zero.

## Data and transitions

| Redis key | Type | Contents |
| --- | --- | --- |
| `jobs:ready` | List | Job IDs: LPUSH on enqueue/recovery, RPOP on claim (FIFO) |
| `jobs:processing` | Sorted set | Job ID members, claimedAt epoch-millisecond scores |
| `job:<id>` | Hash | id, type, JSON payload, status, createdAt, updatedAt; workerId, claimedAt, claimToken while processing |

Redis stores hash fields as strings; HTTP reads decode payload and timestamps.
Claim tokens are internal and omitted from HTTP responses.

1. Enqueue atomically creates a pending job hash and pushes its ID onto ready.
2. Claim atomically removes the oldest ID, adds processing membership, records
   worker ownership and a fresh claim token, and returns the job data.
3. ACK checks processing membership, status, worker ID, and token atomically.
   If ownership still matches, it removes processing membership, marks completed,
   clears claim metadata, and retains the hash. A late ACK is ignored and logged.
4. Recovery queries at most 100 IDs older than `Date.now() - JOB_TIMEOUT_MS`.
   For each ID, a Lua script rechecks the current score/status/claimedAt. Only a
   still-stale claim is removed from processing, reset to pending, cleared of
   ownership, and pushed back to ready. Successful recoveries log the job ID.

Scripts prevent competing workers/scanners from interleaving transitions.
If ACK wins, recovery does nothing. If recovery wins, the old ACK cannot complete
the job, including after a new worker claims it. Two scanners cannot requeue the
same claim twice. Recovered jobs join the back of the FIFO ready queue.

## Normal processing test

Start the API with the worker stopped. In a third PowerShell terminal:

```powershell
Invoke-RestMethod http://localhost:3000/health
$job = Invoke-RestMethod -Method Post -Uri http://localhost:3000/jobs -ContentType 'application/json' -Body '{"type":"send_email","payload":{"to":"test@example.com"}}'
$job
Invoke-RestMethod "http://localhost:3000/jobs/$($job.id)"
```

The job should be pending. Start the worker, wait about two seconds, then repeat:

```powershell
Invoke-RestMethod "http://localhost:3000/jobs/$($job.id)"
```

Expect completed status, creation/update timestamps, and no workerId/claimedAt.
Worker logs show claim and completion. With redis-cli installed, inspect without
mutating data (substitute the submitted ID):

```powershell
redis-cli -u redis://localhost:6379/1 LRANGE jobs:ready 0 -1
redis-cli -u redis://localhost:6379/1 ZRANGE jobs:processing 0 -1 WITHSCORES
redis-cli -u redis://localhost:6379/1 HGETALL "job:<jobId>"
```

Completed IDs should be absent from both queue structures; their hashes remain.
POST `{}` should return 400, as should a missing request body. GET a nonexistent
job ID should return 404. There are no manual consumption endpoints.

## Worker crash and recovery test

1. Keep the API running and stop all workers. In the worker terminal set a delay
   long enough to let you kill the process before ACK:

   ```powershell
   $env:SIMULATED_PROCESSING_MS = '60000'
   npm run start:worker
   ```

2. Submit another job using the normal POST command above. When the worker logs
   `processing job: <id>`, press Ctrl+C immediately, before the 15-second timeout.
   Read the job by ID: it remains processing, with workerId and claimedAt. It stays
   there while no worker is running, even after its timeout expires.

3. Start a replacement worker in that terminal with the delay removed:

   ```powershell
   $env:SIMULATED_PROCESSING_MS = '0'
   npm run start:worker
   ```

4. After the claim is older than 15 seconds, the next recovery scan logs
   `Recovered stale job: <id>`. The next processing poll claims and completes it.
   Read the same ID again: expect completed status and no ownership fields.
   On an otherwise idle local system, allow timeout + recovery interval + one
   polling interval from the original claim, or longer if no worker was running.

## Limits

There is no heartbeat or idempotency. A slow but living worker can become stale;
ownership checks protect Redis state but cannot prevent duplicate external side
effects. Use synchronized clocks and a timeout longer than expected job duration.
This is abandoned-claim recovery, not a normal-job retry policy; malformed jobs
or repeated processing errors can currently cycle through recovery indefinitely.

Redis must be available at startup. Disconnected commands fail instead of queuing
offline; restart processes after a Redis outage because automatic reconnection is
disabled. `/health` reports API liveness, not Redis readiness. Redis data surviving
a Redis restart depends on your Redis persistence configuration. Completed hashes
have no cleanup policy. Scripts target standalone Redis, not Redis Cluster.

Retries, backoff, DLQ, PostgreSQL, Docker Compose, real business logic, and a test
framework are deliberately deferred.
