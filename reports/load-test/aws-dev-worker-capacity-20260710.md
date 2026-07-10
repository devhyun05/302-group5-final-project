# AWS Dev AI Worker Capacity - 2026-07-10

## Scope

- Initial registered-user target: 200
- Simultaneous AI job scenarios: 5 (2.5%), 10 (5%), and 20 (10%)
- Queue: `aura-ai-jobs-dev`
- Worker service: minimum 1, maximum 3
- One Worker handles one SQS message at a time.
- No additional OpenAI or Bedrock calls were made for this report.

## Measured Durations

Durations came from successful RDS report timestamps and were cross-checked with CloudWatch Worker logs.

| Job type | Samples | User-ready p50 | User-ready p95 | Worker-held p50 | Worker-held p95 |
|---|---:|---:|---:|---:|---:|
| Face analysis | 44 | 26.6 s | 37.9 s | 51.0 s | 100.6 s |
| Makeup feedback | 45 | 27.8 s | 34.0 s | 27.8 s | 34.0 s |
| Reference extraction | 3 | 69.2 s | 74.7 s | 69.2 s | 74.7 s |

Face analysis becomes user-ready after text analysis. Its Worker remains occupied while the recommendation image is generated, and the report screen polls for that image separately.

## Scaling Delay

- SQS scale-out metric period: up to 60 seconds before detection
- Observed ECS 1-to-2 scaling activity: 33 seconds
- Capacity model: additional Workers become available after 60 seconds (typical) or 90 seconds (conservative)
- A five-job burst normally leaves four visible messages after the always-on Worker receives one, so the current step policy adds one Worker. Bursts of 10 or 20 add two Workers.

## User-Ready Time at Measured p95

These values assume all jobs in a row are the same type and arrive together. `Middle` is the median user; `Last` is the final user in that burst.

| Job type | Simultaneous jobs | First | Middle | Last (60 s scale delay) | Last (90 s scale delay) |
|---|---:|---:|---:|---:|---:|
| Face analysis | 5 | 0:38 | 2:19 | 3:59 | 3:59 |
| Face analysis | 10 | 0:38 | 3:19-3:49 | 5:40 | 5:40 |
| Face analysis | 20 | 0:38 | 5:40 | 11:41 | 12:11 |
| Makeup feedback | 5 | 0:34 | 1:34-1:42 | 2:08 | 2:16 |
| Makeup feedback | 10 | 0:34 | 1:42-2:04 | 2:42 | 3:12 |
| Makeup feedback | 20 | 0:34 | 2:42-3:12 | 4:32 | 4:54 |
| Reference extraction | 5 | 1:15 | 2:30-2:45 | 3:44 | 4:00 |
| Reference extraction | 10 | 1:15 | 3:30-3:44 | 4:59 | 5:14 |
| Reference extraction | 20 | 1:15 | 4:59-5:14 | 9:43 | 9:58 |

## Warm Three-Worker Throughput

At measured p95 Worker-held duration:

| Job type | Approximate throughput |
|---|---:|
| Face analysis | 1.79 jobs/minute |
| Makeup feedback | 5.30 jobs/minute |
| Reference extraction | 2.41 jobs/minute |

## Decision

- System safety: pass. SQS buffers bursts and protects FastAPI and RDS.
- User experience with up to five simultaneous AI jobs: acceptable only if a roughly four-minute last-user face-analysis wait is acceptable.
- User experience with 10-20 simultaneous AI jobs: capacity warning. The server remains available, but late users wait too long.
- Raising only the maximum Worker count reduces waiting but also increases OpenAI/Bedrock concurrency, RDS connections, and Fargate/public-IPv4 cost.

## Recommended Next Design Decision

Before increasing Worker count, consider splitting face text analysis from recommendation-image generation. Face results are user-ready at p95 37.9 seconds, but the current Worker is held for p95 100.6 seconds. A separate image-generation queue would let the analysis Worker receive the next face job sooner.

If face analysis, feedback, and reference extraction remain in one standard queue, long reference or image jobs can delay shorter feedback jobs. Separate queues or priority-aware routing should be considered after real usage shows more than five concurrent AI jobs.

## Reproduction

The deterministic capacity model is in `scripts/calculate_worker_capacity.py`.

```powershell
.\services\backend\.venv\Scripts\python.exe `
  scripts\calculate_worker_capacity.py `
  --job-counts 5,10,20
```
