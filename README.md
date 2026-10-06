# Reliable Job Queue

A learning project using JavaScript/CommonJS, Express, and a custom Redis queue.
Phase 3 adds bounded attempts, exponential backoff, delayed retries, and a DLQ.
The API and workers remain independent processes; Lua owns atomic transitions.

## Run locally

Requires Node.js 20+ and an already-running standalone Redis server.

```powershell
npm install
```

Stop earlier-phase API/worker processes. Use an empty Redis database dedicated to
Phase 3: older hashes lack attempt metadata, and Phase 1 lists contain serialized
jobs. There is no automatic migration or deletion of old data. Startup checks
queue types and detects a legacy serialized job at the ready-list tail; claim/read
reject missing or invalid attempt metadata. Startup does not scan every hash.
The examples use database 1; choose another unused database if it contains data.
Use the same Redis URL in every terminal. Do not mix old and new workers.

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
$env:RETRY_BASE_DELAY_MS = '1000'
$env:RETRY_MAX_DELAY_MS = '30000'
$env:RETRY_POLL_INTERVAL_MS = '500'
$env:SIMULATED_PROCESSING_MS = '0'
$env:SIMULATED_FAILURES_BEFORE_SUCCESS = '0'
npm run start:worker
```

## Configuration and API

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection, database 0 by default |
| `PORT` | `3000` | API port |
| `JOB_TIMEOUT_MS` | `15000` | Claim age beyond which recovery can fail it |
| `RECOVERY_INTERVAL_MS` | `5000` | Stale-claim scan interval |
| `RETRY_BASE_DELAY_MS` | `1000` | First retry delay |
| `RETRY_MAX_DELAY_MS` | `30000` | Backoff cap; may be below the base |
| `RETRY_POLL_INTERVAL_MS` | `500` | Due-retry scan interval |
| `SIMULATED_PROCESSING_MS` | `0` | Development handler delay for crash tests |
| `SIMULATED_FAILURES_BEFORE_SUCCESS` | `0` | Fail each job while persisted attempts <= this value |

Worker values must be integers <= 2147483647. Timing values must be positive;
the two simulation values may be zero. Blank, negative, fractional, or out-of-range
values fail worker startup. Processing polls every 1000 ms. Use the same timeout
and retry settings on all workers and synchronized clocks. Simulation is for
development/manual testing; the default handler succeeds.

- `GET /health`: API liveness.
- `POST /jobs`: `{ "type": "send_email", "payload": {}, "maxAttempts": 3 }`.
  `maxAttempts` is optional, defaults to **3**, and must be a JSON integer from
  **1 through 10**. Null, strings, booleans, fractions, and out-of-range values
  return HTTP 400. The default is fixed; there is no `DEFAULT_MAX_ATTEMPTS` setting.
- `GET /jobs/:id`: retained job metadata, or HTTP 404 if absent.
- `GET /jobs/dead`: `{ "ids": [...] }`, up to 100 most recently dead-lettered IDs.
  Registered before `/jobs/:id`; fetch each ID to read its metadata.

## Redis data model

| Redis key | Type | Contents |
| --- | --- | --- |
| `jobs:ready` | List | IDs only: LPUSH on enqueue/promotion, RPOP on claim (FIFO) |
| `jobs:processing` | Sorted set | Job ID, score = claimedAt epoch milliseconds |
| `jobs:retry` | Sorted set | Job ID, score = nextRetryAt epoch milliseconds |
| `jobs:dead` | List | Terminal failed IDs, newest first |
| `job:<id>` | Hash | Payload and authoritative job metadata |

Hashes contain `id`, `type`, JSON `payload`, `status`, `createdAt`, `updatedAt`,
`attempts`, and `maxAttempts`. Active `workerId`, `claimedAt`, and `claimToken`
exist only while processing. `nextRetryAt` exists only while retrying. `failedAt`
exists only after terminal failure. `lastError` stores the most recent failure
message (maximum 1000 JavaScript characters), including after eventual success
as diagnostic history; stack traces and serialized Error objects are not stored.

HTTP reads decode payload and all numeric fields: `createdAt`, `updatedAt`,
`claimedAt`, `attempts`, `maxAttempts`, `nextRetryAt`, and `failedAt`. Absent
optional fields stay absent. Malformed numeric metadata is surfaced as an error,
not silently converted to null/NaN. Claim tokens are internal and omitted from HTTP.

## Lifecycle and atomic transitions

```text
enqueue -> pending -> processing -> completed
                         |
                         +-- execution error or expired claim
                               |
                               +-- attempts < maxAttempts -> retrying
                               |                              |
                               |                        due promotion
                               |                              |
                               |                           pending
                               |
                               +-- attempts >= maxAttempts -> dead
```

An **attempt is one successful claim**, not one completed handler invocation.
Enqueue stores attempts=0 and the job's maxAttempts. Claim increments attempts
atomically (first execution=1), records worker ownership and a new random token,
and returns the updated hash. A crash immediately after claim still consumes an
attempt. Promotion does not increment attempts. maxAttempts includes the first
execution; maxAttempts=1 means no retries.

1. **Enqueue:** creates a pending hash and LPUSHes the ID atomically.
2. **Claim:** checks pending status, attempt budget, and absence from processing
   before RPOP, recording processing membership, and incrementing attempts.
3. **ACK:** verifies processing membership, status, workerId, and claimToken.
   Removes processing membership, marks completed, updates updatedAt, and clears
   active claim/retry/terminal-failure fields. A late ACK does nothing.
4. **Failure:** verifies the same ownership tuple. With attempts remaining,
   removes processing membership, sets retrying/lastError/nextRetryAt/updatedAt,
   clears claim metadata, and adds the ID to jobs:retry. It never ACKs the job.
5. **Promotion:** scans at most 100 due retry IDs. Each Lua call rechecks score <=
   now, retrying status, and matching nextRetryAt, then removes retry membership,
   sets pending/updatedAt, clears nextRetryAt, and LPUSHes ready exactly once.
6. **DLQ:** when attempts >= maxAttempts, failure instead sets dead/lastError/
   failedAt/updatedAt, removes processing membership, clears claim/retry fields,
   and LPUSHes jobs:dead. The hash remains readable. There is no automatic replay.
7. **Stale recovery:** scans at most 100 claims strictly older than
   `Date.now() - JOB_TIMEOUT_MS`. Lua rechecks the current processing score,
   status, and claimedAt before applying the same retry/DLQ policy with
   `lastError = "worker claim expired"`. Recovery never resets attempts.

For both ordinary failures and expired claims:

```text
delay = min(RETRY_BASE_DELAY_MS * 2^(attempts - 1), RETRY_MAX_DELAY_MS)
nextRetryAt = failure/recovery time + delay
```

With base=1000, retry delays are 1000, 2000, 4000 ms, capped at 30000 ms by
default. With maxAttempts=3, only the first two failures schedule retries.
Backoff does not sleep/block a worker. Actual execution can start later than
nextRetryAt because of promotion/processing polls and other queued work.

Each processing, recovery, and promotion loop has its own overlap guard. Errors
are logged and guards are cleared so future iterations run. Redis/ACK errors
are kept outside the simulated handler's failure catch: an uncertain ACK must
not be interpreted as a handler failure. Unconfirmed claims can later expire.

Lua prevents interleaved multi-key transitions. Two workers cannot claim the same
ready entry. Old tokens cannot ACK or fail a replacement claim, even when the
workerId is reused. Competing promoters/recovery scans cannot move the same
current retry/claim twice. ACK/failure/recovery races have one winner; completed
and dead jobs cannot subsequently be recovered or automatically retried.
Destination types are checked before multi-key writes because Redis Lua errors
do not roll back earlier writes. These guarantees assume data is modified through
the queue, not through arbitrary manual Redis edits.

## Manual validation (PowerShell)

Use an isolated, initially empty database. Keep the API running and stop all
workers between scenarios. Set worker environment variables before restarting;
changing another terminal's environment does not change a running worker.

In a client terminal, create these helpers:

```powershell
$env:REDIS_URL = 'redis://localhost:6379/1'
function New-TestJob([int]$maxAttempts = 3) {
    $body = @{ type = 'manual_test'; payload = @{}; maxAttempts = $maxAttempts } | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri http://localhost:3000/jobs -ContentType 'application/json' -Body $body
}
function Read-TestJob($id) { Invoke-RestMethod "http://localhost:3000/jobs/$id" }
$job = New-TestJob
Read-TestJob $job.id
```

Before starting a worker, expect pending, attempts=0, maxAttempts=3.

**Test A — normal success:** set these in the worker terminal and start it:

```powershell
$env:SIMULATED_FAILURES_BEFORE_SUCCESS = '0'
$env:SIMULATED_PROCESSING_MS = '0'
npm run start:worker
```

After about two seconds, `Read-TestJob $job.id` should show completed, attempts=1,
and no workerId/claimedAt/nextRetryAt/failedAt.

**Test B — transient errors:** stop the worker, set
`$env:SIMULATED_FAILURES_BEFORE_SUCCESS = '2'`, and run `npm run start:worker`.
In the client terminal:

```powershell
$job = New-TestJob
do {
    $state = Read-TestJob $job.id
    $state | Select-Object status,attempts,updatedAt,nextRetryAt,lastError
    if ($state.status -eq 'retrying') { "Scheduled delay: $($state.nextRetryAt - $state.updatedAt) ms" }
    Start-Sleep -Milliseconds 200
} while ($state.status -notin @('completed', 'dead'))
```

Expect failures on attempts 1 and 2, scheduled delays exactly 1000 and 2000 ms
with the default settings, and completion on attempt 3. Polling may display the
same retry more than once. Worker logs identify each attempt and nextRetryAt.

**Test C — DLQ:** stop the worker, set
`$env:SIMULATED_FAILURES_BEFORE_SUCCESS = '99'`, restart it, then repeat Test B's
client block. Expect dead at attempts=3 with lastError and numeric failedAt.

```powershell
Invoke-RestMethod http://localhost:3000/jobs/dead
redis-cli -u $env:REDIS_URL LRANGE jobs:dead 0 -1
redis-cli -u $env:REDIS_URL LRANGE jobs:ready 0 -1
redis-cli -u $env:REDIS_URL ZRANGE jobs:processing 0 -1 WITHSCORES
redis-cli -u $env:REDIS_URL ZRANGE jobs:retry 0 -1 WITHSCORES
redis-cli -u $env:REDIS_URL HGETALL "job:$($job.id)"
```

The ID occurs once in jobs:dead and is absent from ready/processing/retry.
redis-cli is optional; GET returns the retained hash and the DLQ endpoint lists IDs.

**Test D — killed worker:** stop workers, then in the worker terminal:

```powershell
$env:SIMULATED_FAILURES_BEFORE_SUCCESS = '0'
$env:SIMULATED_PROCESSING_MS = '60000'
npm run start:worker
```

Submit `$job = New-TestJob` in the client terminal. Immediately after the worker
logs its claim, press Ctrl+C in the worker terminal, before the 15-second timeout.
GET should still show processing, attempts=1. Start a replacement:

```powershell
$env:SIMULATED_PROCESSING_MS = '0'
npm run start:worker
```

After expiry, recovery schedules retry with `worker claim expired`. The job then
completes on attempt 2. Allow timeout + recovery interval + backoff + polling.
Repeat with `$job = New-TestJob 1`: the expired first claim goes directly to dead.
For a live stale-owner check, leave the slow worker running, start a fast worker
with matching policy settings in another terminal, and watch the slow worker's
eventual ACK be rejected after replacement processing. This deliberately
demonstrates the no-heartbeat limitation.

Check validation errors and syntax:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/jobs -ContentType 'application/json' -Body '{"type":"test","payload":{},"maxAttempts":0}'
# Expected HTTP 400. Also try 11, -1, 1.5, "3", null, and true.
Get-ChildItem src -Recurse -Filter *.js | ForEach-Object {
    node --check $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $($_.FullName)" }
}
git diff --check
```

Validation performed against local Redis in an initially empty database 15 using
a temporary harness outside the repository: A completed at attempt 1; B completed
at attempt 3 with 1000/2000 ms retries; C entered the DLQ at attempt 3; D killed
actual worker processes and verified retry-to-success and immediate DLQ at the
attempt limit. Stale ACK/failure, competing transitions, capped delay, error
truncation, invalid API/environment values, numeric metadata errors, and
destination-type checks also passed. Test processes and keys were cleaned up.
The first harness run timed out during API startup; a longer startup wait allowed
the complete validation run to pass. No automated test suite was added.

## Limits and next phase

There is no heartbeat or idempotency. A healthy but slow worker can become stale;
claim tokens protect Redis state but cannot prevent duplicate external side
effects. Use a timeout longer than expected handler duration. Schedulers run only
while at least one worker is running. Business handlers are still simulated.

Redis must be available at startup. Disconnected commands fail instead of queuing
offline; automatic reconnection is disabled, so restart processes after an outage.
`/health` reports API liveness, not Redis readiness. Persistence across Redis
restarts depends on external AOF/RDB configuration. Completed/dead hashes and DLQ
entries have no retention policy. Scripts target standalone Redis, not Cluster.

No PostgreSQL durable database, idempotency, heartbeat/lease renewal, automated
test suite/framework, Docker Compose, or DLQ replay is included. No additional
queue library or scheduler service is used. **Next phase: PostgreSQL durable
persistence.**
