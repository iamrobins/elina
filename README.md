# Elina

Bun/Hono trace receiver backed by PostgreSQL. This is an in-progress v0.1 backend.

Licensed under MIT. See [LICENSE](LICENSE).

## Get Elina

Elina is a self-hosted app. The server and dashboard are in one repository. Clone it:

```sh
git clone https://github.com/iamrobins/elina.git
cd elina
```

Run it on your machine with the local Compose file, or use the production file on a Linux host you control. Both files use the single `ghcr.io/iamrobins/elina:latest` image; Compose can build it from this repository. Once the image workflow has published it and the package is public, Docker can pull the same image directly. `getelina.com` is the project website; it does not run your dashboard, API, or database.

## Local run

Copy `.env.example` to `.env`, set independent random values for `POSTGRES_PASSWORD` and `ADMIN_TOKEN` (at least 32 characters), and set `SESSION_SECRET` to 64 random hex characters. Generate `DASHBOARD_PASSWORD_HASH` with `bun -e "const c=require('node:crypto'); const s=c.randomBytes(16); console.log('scrypt:'+s.toString('hex')+':'+c.scryptSync('your-dashboard-password',s,64).toString('hex'))"`, replacing the sample password first. Then run `docker compose up -d --build` from WSL. Compose builds one Elina image and runs migrations before starting the API and dashboard containers. PostgreSQL stays on the private Compose network; the API binds to `127.0.0.1:3000` and the dashboard to `127.0.0.1:3001`.

`GET /health/live` checks the process and `GET /health/ready` checks PostgreSQL. Admin routes use `Authorization: Bearer <ADMIN_TOKEN>`:

- `POST /api/projects` with `{"name":"my-app","retentionDays":30}` returns the project and its write key once.
- `GET /api/projects` lists projects.
- `GET /api/prices/catalog` returns the version and model prices bundled with this build.
- `POST /api/projects/:id/keys` issues another write key, or with `{"kind":"read"}` issues a project-scoped MCP read key. `GET /api/projects/:id/keys` shows each active key's kind; `DELETE /api/keys/:id` revokes either kind.
- `GET /api/projects/:id/prices` lists project model prices. `PUT` to the same path with `provider`, exact `model`, `inputPerMillion`, `outputPerMillion`, and optional `cachedInputPerMillion` adds or updates one. `DELETE` with `provider` and `model` removes it. Rates are USD per million tokens and apply to new spans.

Send OTLP/HTTP traces to `POST /v1/traces` with `Authorization: Bearer <writeKey>`. Protobuf and OTLP JSON, including gzip, are accepted. A 200 response follows a committed PostgreSQL transaction.

Application feedback is optional. Once a trace is stored, `PUT /v1/traces/:traceId/feedback` with the same project write key and JSON `{"verdict":"good"}` or `{"verdict":"bad","note":"..."}` sets or updates that trace's feedback. The note is optional (maximum 2000 characters). A missing trace returns 404. This signal stays separate from dashboard human reviews; keep the write key in server-side code.

Set `ATTRIBUTE_DENYLIST` to comma-separated exact attribute names to remove those fields from resource, scope, span, event, and link attributes before storage. This also removes them from normalized token/cost projections. Request bodies and keys are not logged.

Admin trace reads require `projectId` even with the admin token:

- `GET /api/traces?projectId=<uuid>&from=<ISO>&to=<ISO>&status=error&limit=50&cursor=<opaque>` lists summaries newest first. `nextCursor` continues the same ordering.
- `GET /api/traces/:traceId?projectId=<uuid>` returns a trace and its flat span list.
- `GET /api/metrics/summary?projectId=<uuid>&from=<ISO>&to=<ISO>` returns trace/error counts, error rate, p50/p95 end-to-end trace latency in milliseconds, token totals, known USD cost, and the count of usage spans with unknown cost. Empty time bounds include all stored data.
- `GET /api/metrics/trends?projectId=<uuid>&from=<ISO>&to=<ISO>&bucketMinutes=60` returns up to 30 time buckets with trace count, error rate, p95 latency, known USD cost, and unpriced usage count. Bucket sizes are 5, 60, 360, or 1440 minutes. Cost follows each trace's start time; buckets with unpriced usage have partial cost.

Reported USD cost attributes (`gen_ai.usage.cost_usd`, `elinaobs.cost.usd`, or `tinyobs.cost.usd`) take priority. Otherwise Elina estimates cost from provider token counts and an exact project price or its versioned built-in standard-price snapshot. The snapshot includes OpenAI (`gpt-6-luna`, `gpt-6.1-sol`, `gpt-6.1-terra`, `gpt-6-astra`), Gemini Developer API (`gemini-3-flash-preview`, `gemini-3.1-pro-preview`, `gemini-2.5-flash`), and Anthropic (`claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, `claude-opus-4-5-20251101`). Use `gen_ai.provider.name` values `openai`, `gcp.gemini`, or `anthropic` and the exact model ID. Rates come from the [OpenAI](https://developers.openai.com/api/docs/pricing), [Gemini](https://aistudio.google.com/docs/pricing), and [Anthropic](https://platform.claude.com/docs/en/about-claude/pricing) standard paid pricing pages. The snapshot is bundled with each server build; updating bundled rates requires a new build, while project overrides can be edited in Settings without one. Cached input is priced separately when reported. Unsupported models, nonstandard service tiers, long-context requests with different rates, and incomplete usage remain unknown. Token estimates exclude separately billed audio, tools, cache storage, and cloud platform premiums. Each stored span keeps its cost source; later price edits do not change existing spans. The first pricing migration backfills eligible existing spans once.

Retention runs at API startup and every 24 hours. It deletes traces older than each project's `retentionDays` in batches of 500; span rows cascade. A manual pass is `docker compose exec api bun src/db/retention.ts`. The local Compose file has no backup service; use the production file for scheduled backups.

## Self-hosted production deployment

Run the production Compose file from this repository on your Linux host with Docker Compose, your own DNS name pointing to that host, and inbound TCP ports 80 and 443 (plus UDP 443 if available). Copy `.env.example` to `.env`, replace every placeholder with independent secrets, and set `ELINA_DOMAIN` to your own hostname, `ACME_EMAIL` to your email, and `BACKUP_DIR` to an absolute path outside the repository. Generate the dashboard hash as described above. Keep `.env` and the backup directory readable only by the host administrator. Then run:

```sh
mkdir -p /opt/elina/backups
chmod 700 /opt/elina/backups
docker compose -f compose.prod.yaml up -d --build
docker compose -f compose.prod.yaml ps
```

The proxy obtains HTTPS certificates for `ELINA_DOMAIN`. Only ports 80 and 443 are published. It forwards `/v1/traces`, feedback, and `/mcp` to the API, and the dashboard to the web service; the admin API and PostgreSQL stay on the private Compose network. Use `https://<your-domain>/v1/traces` as the Python SDK endpoint and `https://<your-domain>/mcp` for MCP read keys. This is one operator's installation: everyone with the dashboard password can access every project. Do not use it as a hosted multi-customer service.

The backup service writes a PostgreSQL custom archive immediately, then every 24 hours. It keeps seven days of local archives and reports unhealthy if none is recent. Monitor `docker compose -f compose.prod.yaml ps` and `docker compose -f compose.prod.yaml logs backup`. **Copy archives to a separate machine or storage account**; a local directory does not protect against host loss. Backups contain trace data and key hashes, so encrypt off-host copies and limit access. Before every upgrade, verify a fresh archive exists. To check that the latest archive restores into a temporary database without changing the live one (replace `/opt/elina/backups` if `BACKUP_DIR` differs):

```sh
archive=$(find /opt/elina/backups -maxdepth 1 -name 'elina-*.dump' -type f | sort | tail -1)
test -n "$archive"
docker compose -f compose.prod.yaml run --rm --no-deps --entrypoint sh backup /scripts/restore-check.sh "/backups/$(basename "$archive")"
```

To recover after database loss, use a fresh host or an **empty** PostgreSQL volume with the same `.env` secrets and the archive in `BACKUP_DIR`. Start only PostgreSQL with `docker compose -f compose.prod.yaml up -d postgres`. Restore with `docker compose -f compose.prod.yaml run --rm --no-deps --entrypoint pg_restore backup --exit-on-error --no-owner --dbname=elina /backups/<archive>`, then start the full stack with `docker compose -f compose.prod.yaml up -d --build`. Do not restore into a populated database. Keep the original archive until the dashboard and a known trace have been checked. If the host or its secrets were compromised, rotate the admin token, dashboard password, and project keys after recovery.

Run `bun test` and `bun run typecheck` locally. With Compose running, set `$env:ELINA_BASE_URL='http://127.0.0.1:3000'` in PowerShell, then run `bun --env-file=.env test tests/api.test.ts`. The live test creates projects and traces in the local database.

## MCP read access

The existing API process serves Streamable HTTP at `http://127.0.0.1:3000/mcp`. Create an **MCP read key** in project Settings (or through the admin key endpoint), then configure an MCP client with that URL and `Authorization: Bearer <readKey>`. The tools are `get_health`, `list_traces`, and `get_trace`. Each tool is scoped to the key's project. Trace detail returns observation summaries, including error messages, but omits captured inputs, outputs, and raw attributes. Read keys cannot ingest traces or submit feedback. Revoke a key in Settings to end access.

The default Compose deployment binds to loopback. Connecting a remote client such as Slackbot requires HTTPS hosting and compatible client authentication; this release does not expose a public MCP endpoint.

## Protocol generation

The checked-in `src/gen` files were generated with `protoc` and `@bufbuild/protoc-gen-es` 2.16.0 from [opentelemetry-proto v1.11.1](https://github.com/open-telemetry/opentelemetry-proto/releases/tag/v1.11.1) (commit `b3f75588eb23c5fca62264edd05d382de49beb1a`) and [googleapis](https://github.com/googleapis/googleapis/commit/5639cefc68d40226c32feaff3e69b055aea904ad) (`google/rpc/status.proto`). To regenerate, compile `common.proto`, `resource.proto`, `trace.proto`, `trace_service.proto`, and `status.proto` with `--es_opt=target=ts` into `src/gen`.
