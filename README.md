# Elina server

Bun/Hono trace receiver backed by PostgreSQL. This is an in-progress v0.1 backend; metrics and retention are not implemented yet.

## Local run

Copy `.env.example` to `.env`, set independent random values for `POSTGRES_PASSWORD` and `ADMIN_TOKEN` (at least 32 characters), then run `docker compose up -d --build` from WSL. Compose runs migrations before starting the API. PostgreSQL stays on the private Compose network; the API binds to `127.0.0.1:3000`.

`GET /health/live` checks the process and `GET /health/ready` checks PostgreSQL. Admin routes use `Authorization: Bearer <ADMIN_TOKEN>`:

- `POST /api/projects` with `{"name":"my-app","retentionDays":30}` returns the project and its write key once.
- `GET /api/projects` lists projects.
- `POST /api/projects/:id/keys` issues another write key.
- `DELETE /api/keys/:id` revokes a write key.

Send OTLP/HTTP traces to `POST /v1/traces` with `Authorization: Bearer <writeKey>`. Protobuf and OTLP JSON, including gzip, are accepted. A 200 response follows a committed PostgreSQL transaction.

Admin trace reads require `projectId` even with the admin token:

- `GET /api/traces?projectId=<uuid>&from=<ISO>&to=<ISO>&status=error&limit=50&cursor=<opaque>` lists summaries newest first. `nextCursor` continues the same ordering.
- `GET /api/traces/:traceId?projectId=<uuid>` returns a trace and its flat span list.

## Protocol generation

The checked-in `src/gen` files were generated with `protoc` and `@bufbuild/protoc-gen-es` 2.16.0 from [opentelemetry-proto v1.11.1](https://github.com/open-telemetry/opentelemetry-proto/releases/tag/v1.11.1) (commit `b3f75588eb23c5fca62264edd05d382de49beb1a`) and [googleapis](https://github.com/googleapis/googleapis/commit/5639cefc68d40226c32feaff3e69b055aea904ad) (`google/rpc/status.proto`). To regenerate, compile `common.proto`, `resource.proto`, `trace.proto`, `trace_service.proto`, and `status.proto` with `--es_opt=target=ts` into `src/gen`.
