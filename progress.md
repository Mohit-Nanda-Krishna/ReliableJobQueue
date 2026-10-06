# Reliable Job Queue - Progress

## Current Architecture

Phase 3: bounded attempts, exponential backoff, delayed retries, and DLQ.

Independent Express API -> Redis ready list -> independent worker -> processing
sorted set -> completed hash, delayed retry sorted set, or dead-letter list.
Workers run processing, stale recovery, and retry promotion loops. Lua owns
atomic state transitions; queue structures contain only job IDs.

## Completed Features

- Independent API/worker; health, enqueue, job lookup, and limited DLQ ID lookup.
- Atomic enqueue/claim/ACK with job state/metadata and workerId + claimToken ownership.
- Attempts increment on claim, including claims abandoned by crashed workers.
- Per-job maxAttempts (default 3, range 1-10) with HTTP validation.
- Atomic failure transitions, bounded lastError, terminal failedAt, numeric API metadata.
- Exponential backoff with a configurable cap; jobs:retry stores scheduled timestamps.
- Bounded, concurrency-safe promotion from retrying to pending/ready.
- Stale-worker recovery follows the same retry/DLQ policy; repeated crashes exhaust attempts.
- jobs:dead retains terminal IDs once per terminal transition; hashes remain readable.
- Three independent, non-overlapping worker loops with per-iteration error logging.
- Deterministic failure and processing-delay simulation; configuration/manual tests in README.md.

## Current Limitations

- No PostgreSQL durable database, idempotency, heartbeat, automated test suite, or Docker Compose.
- Simulated rather than real business handlers; slow living workers can expire and duplicate execution remains possible.
- Schedulers require a running worker. Use matching worker policy settings and synchronized clocks.
- Redis restart durability depends on external AOF/RDB configuration; no completed/dead retention policy.
- No Redis Cluster, DLQ replay, or older-phase data migration. Use a fresh dedicated Phase 3 database.
- Redis does not automatically reconnect; restart processes after an outage. Health is API liveness only.

## Next Phase

PostgreSQL durable persistence. Deliberately not implemented in Phase 3.

## Validation

- Local Redis, isolated database 15: A completed at attempt 1; B completed at attempt 3 with 1000/2000 ms retries; C dead at attempt 3.
- D killed actual worker processes: maxAttempts=3 recovered and completed at attempt 2; maxAttempts=1 went dead. Stale ACK/failure were rejected during replacement processing.
- Additional checks passed: concurrent claims/recovery/promotion/failures, single DLQ insertion, backoff cap, error truncation, invalid API/environment values, numeric metadata errors, and pre-write destination-type checks.
- Temporary validation harness stayed outside the repository; its processes and Redis test keys were cleaned up. Initial harness API startup timeout was resolved by increasing its startup wait.
- Source syntax checks and git diff --check passed. No dependencies, test framework, commits, or pushes added.
