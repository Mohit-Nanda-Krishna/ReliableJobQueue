# Reliable Job Queue - Progress

## Current Architecture

Phase 2: explicit Redis job state and recovery of abandoned claims.

Independent Express API -> Redis ready list -> independent worker -> processing
sorted set -> ACK and completed job hash. Each worker also scans for stale claims
and conditionally returns them to ready. Lua makes each state transition atomic.

## Completed Features

- Independent API and worker processes; `GET /health`, `POST /jobs`, `GET /jobs/:id`.
- `jobs:ready`: FIFO list of job IDs, using LPUSH/RPOP inside atomic transitions.
- `job:<id>`: Redis hash with payload, status, creation/update timestamps, and active claim metadata.
- `jobs:processing`: sorted set of job IDs scored by `claimedAt` in epoch milliseconds.
- Unique worker IDs and claim tokens; ACK only completes the current owner's claim.
- Completed hashes are retained; stale claims return to pending and ready exactly once per recovery transition.
- Configurable `REDIS_URL`, `PORT`, `JOB_TIMEOUT_MS` (15000), and `RECOVERY_INTERVAL_MS` (5000).
- Non-overlapping processing and recovery loops; recovery scans up to 100 IDs per interval.
- Optional `SIMULATED_PROCESSING_MS` (0) for manual crash tests; instructions in README.md.

## Current Limitations

- No normal-job retry policy, exponential backoff, DLQ, PostgreSQL, idempotency, automated test suite, or Docker Compose.
- Processing is simulated. No heartbeat: slow workers can time out, so duplicate execution remains possible.
- Recovery runs only while a worker is running. All workers should use the same timeout and synchronized clocks.
- Redis persistence across Redis restarts depends on its external AOF/RDB configuration; hashes alone do not guarantee disk durability.
- Completed hashes have no retention policy. Redis Cluster and Phase 1 data migration are not supported.
- Stop old processes and use a fresh dedicated Redis database for Phase 2; startup rejects detected legacy queue data without deleting it.
- Redis connections do not automatically reconnect; restart affected processes after a Redis outage. Health reports API liveness only.

## Next Phase

Retries + exponential backoff + DLQ. Not implemented in Phase 2.
