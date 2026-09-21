# deploy

The production image for the Genie Ops Center application (S0-05, R-32/R-33/R-35).

## What this image is

One image builds every deployment. The only build argument is `MODULE_INCLUDE`, the
module selection the registry is generated from (ADR 0008, DEC-33). A build argument
is used rather than a build secret because it is deliberately readable in the image
history; it names modules, never a credential.

The build needs no deployment variable and no reachable database. Every deployment
value is read at run time, so the same image serves a second configuration.

## Build

```bash
docker build -f deploy/Dockerfile --build-arg MODULE_INCLUDE=placeholder -t genie-s005:test .
```

The image is built from the repository root, so the build context is the whole
workspace and `.dockerignore` keeps it small.

## Run

```bash
docker run --rm \
  -e DATABASE_URL=postgres://user:password@host:5432/database \
  -e PUBLIC_URL=https://example.invalid \
  -p 3000:3000 \
  genie-s005:test
```

Required variables (validated before any connection opens):

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | A `postgres://` or `postgresql://` connection string. |
| `PUBLIC_URL` | The deployment's public `http`/`https` URL. |

Optional variables carry the defaults the environment contract declares:
`FILE_STORAGE_ADAPTER`, `FILE_MAX_BYTES`, `GENIE_CHAT_API_ALLOWED_ORIGINS`,
`AUTH_TRUSTED_PROXIES`, `LOCK_TIMEOUT_MS`, `LOG_LEVEL`, `PORT`.

## Entrypoints

The image carries one binary and dispatches on its first argument (R-35):

| Argument | Behavior |
| --- | --- |
| `app` (default) | Runs the standalone Next server. |
| `worker`, `genie-ops` | Reserved. They exit 64 until Section 1 delivers them. |
| anything else | Exits 64 with the accepted arguments. |

The launcher locates the single standalone `server.js` under `/app` rather than
hard-coding its depth, because the file tracing root differs between a standalone
project and a workspace member. An ambiguous tree exits 70 instead of starting an
arbitrary server.

## Startup and readiness

`src/instrumentation.ts` runs the bootstrap in the Node runtime before request
handling: validate the environment, build the one tenant context, apply every
migration history under the shared advisory lock, then publish the context. A
failure exits the process nonzero inside one total budget covering diagnostics,
cleanup and log flushing, so a container never stays alive on a schema that did not
migrate.

`GET /api/health` returns `200` with the body `ok` once the context is published,
and `503` before that. This response is the definition of readiness: a successful
health response means migrations completed.
