# Elina server

Bun/Hono trace receiver backed by PostgreSQL. This is an in-progress v0.1 backend.

## Local run

Copy `.env.example` to `.env`, set independent random values for `POSTGRES_PASSWORD` and `ADMIN_TOKEN` (at least 32 characters), then run `docker compose up -d --build` from WSL. Compose runs migrations before starting the API. PostgreSQL stays on the private Compose network; the API binds to `127.0.0.1:3000`.

`GET /health/live` checks the process and `GET /health/ready` checks PostgreSQL. Admin routes use `Authorization: Bearer <ADMIN_TOKEN>`:

- `POST /api/projects` with `{"name":"my-app","retentionDays":30}` returns the project and its write key once.
- `GET /api/projects` lists projects.
- `POST /api/projects/:id/keys` issues another write key.
- `DELETE /api/keys/:id` revokes a write key.

Send OTLP/HTTP traces to `POST /v1/traces` with `Authorization: Bearer <writeKey>`. Protobuf and OTLP JSON, including gzip, are accepted. A 200 response follows a committed PostgreSQL transaction.

Set `ATTRIBUTE_DENYLIST` to comma-separated exact attribute names to remove those fields from resource, scope, span, event, and link attributes before storage. This also removes them from normalized token/cost projections. Request bodies and keys are not logged.

Admin trace reads require `projectId` even with the admin token:

- `GET /api/traces?projectId=<uuid>&from=<ISO>&to=<ISO>&status=error&limit=50&cursor=<opaque>` lists summaries newest first. `nextCursor` continues the same ordering.
- `GET /api/traces/:traceId?projectId=<uuid>` returns a trace and its flat span list.
- `GET /api/metrics/summary?projectId=<uuid>&from=<ISO>&to=<ISO>` returns trace/error counts, error rate, p50/p95 end-to-end trace latency in milliseconds, token totals, known USD cost, and the count of usage spans with unknown cost. Empty time bounds include all stored data.

Reported USD cost attributes (`gen_ai.usage.cost_usd`, `elinaobs.cost.usd`, or `tinyobs.cost.usd`) are stored as decimal values. Unknown cost remains null; model-price estimates await a versioned, verified price table.

Retention runs at API startup and every 24 hours. It deletes traces older than each project's `retentionDays` in batches of 500; span rows cascade. A manual pass is `docker compose exec api bun src/db/retention.ts`. Database backups need a separate retention policy.

Run `bun test` and `bun run typecheck` locally. With Compose running, set `$env:ELINA_BASE_URL='http://127.0.0.1:3000'` in PowerShell, then run `bun --env-file=.env test tests/api.test.ts`. The live test creates projects and traces in the local database.

## Protocol generation

The checked-in `src/gen` files were generated with `protoc` and `@bufbuild/protoc-gen-es` 2.16.0 from [opentelemetry-proto v1.11.1](https://github.com/open-telemetry/opentelemetry-proto/releases/tag/v1.11.1) (commit `b3f75588eb23c5fca62264edd05d382de49beb1a`) and [googleapis](https://github.com/googleapis/googleapis/commit/5639cefc68d40226c32feaff3e69b055aea904ad) (`google/rpc/status.proto`). To regenerate, compile `common.proto`, `resource.proto`, `trace.proto`, `trace_service.proto`, and `status.proto` with `--es_opt=target=ts` into `src/gen`.
