# Reliable Job Queue — Progress

## Current Architecture

Client
  ↓
Express API process (`npm run start:api`)
  ↓
Redis `jobs:ready`
  ↓
Independent worker process (`npm run start:worker`)
  ↓ atomic `RPOPLPUSH`
Redis `jobs:processing`
  ↓ successful simulated processing
Acknowledgement (`LREM`)

## Completed Features

- `GET /health` and validated `POST /jobs` endpoints.
- Jobs have UUIDs, a type, payload, and initial `pending` status.
- Redis-backed FIFO ready queue using `LPUSH` and atomic claims to a processing list.
- Acknowledgement removes successfully processed jobs from `jobs:processing`.
- API and worker run as separate Node.js processes.
- Redis URL and HTTP port can be configured with `REDIS_URL` and `PORT`.
- Worker polling prevents overlapping processing attempts within one worker process.

## Current Limitations

- Job processing is simulated; there is no business logic yet.
- A job left in `jobs:processing` by a worker crash is not recovered yet.
- No retries, backoff, DLQ, idempotency, PostgreSQL, automated tests, or multi-worker concurrency testing.
- Redis must be running before either process starts.

## Next Phase

Design stale-job recovery and failure handling, including retry attempts and backoff, before introducing a dead-letter queue.
