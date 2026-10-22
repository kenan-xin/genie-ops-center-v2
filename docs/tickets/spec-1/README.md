# Spec 1 ticket breakdown

Spec: [Deployment and setup](../../specs/01-deployment-and-setup.md). Technical plan: [01-deployment-and-setup.md](../../tech-plans/01-deployment-and-setup.md). Beads epic: `genie-ops-center-v2-1ia`. Beads owns live status, claims and blockers. This index records the ticket set and its scope, written from the beads on 2026-10-22.

Status: all Section 1 tickets are closed. Gates S1-G1 to S1-G3 are in the technical plan.

## Tickets

| Ticket | Bead | Status | Title |
| --- | --- | --- | --- |
| S1-01 | `1ia.1` | closed | Deployment tables migration |
| S1-02 | `1ia.2` | closed | genie-ops entry, command runner, audit helper and migrate |
| S1-03 | `1ia.4` | closed | genie-ops setup with migrations and seed steps, schema emission |
| S1-04 | `1ia.3` | closed | Setup gate, not-set-up page and degraded health |
| S1-05 | `1ia.9` | closed | Generated stack template rework and customer smoke test |
| S1-06 | `1ia.5` | closed | File storage service with postgres adapter and SVG sanitizing |
| S1-07 | `1ia.6` | closed | Integration records and call-time secret resolver |
| S1-08 | `1ia.7` | closed | Mailer interface with resend and smtp adapters |
| S1-09 | `1ia.8` | closed | pg-boss job queue and worker entrypoint |
| S1-10 | `1ia.10` | closed | Typed event bus, serialization and capabilities channel |
| S1-11 | `1ia.11` | closed | Module lifecycle guard proof: rejection, upgrade registration, never-seeded omission |
| S1-12 | `1ia.12` | closed | Public address, cross-cutting proof, two-stack isolation and Section 1 acceptance |
| S1-13 | `1ia.13` | closed | MigrationRun extension and compiled module list |
| S1-14 | `1ia.14` | closed | withTransaction seam |
| S1-15 | `1ia.15` | closed | Tenant context readers and disabled-module refusal |
| S1-16 | `1ia.11.1` | closed | module ledger naming and pinned drizzle migrations schema |
| S1-17 | `1ia.16` | closed | genie-ops module enable|disable and retire |
| S1-18 | `1ia.17` | closed | Squawk and drizzle-kit check pull-request job |

## Follow-up beads under this epic

| Bead | Type | Status | Title |
| --- | --- | --- | --- |
| `0te` | bug | closed | Startup diagnostics: migration log and invalid-environment message |
| `0za5` | chore | closed | Customer stack: Keycloak readiness healthcheck |
| `1rd.3.1` | task | closed | genie-ops setup must derive primary_foreground with the shared branding rule |
| `3jw` | bug | closed | Map unauthenticated tRPC errors to a core app code at 401 |
| `3ui` | task | closed | Release: open the first develop-to-main pull request after Section 1 |
| `7dg` | bug | closed | check-migrations: ignore CONCURRENTLY inside SQL comments |
| `a2f` | bug | closed | Generated-module proof: seed an enabled tenant_module row for the generated module |
| `aan` | task | closed | Mailer: refuse an absolute mail link whose origin is not PUBLIC_URL (R-70 strict) |
| `cn2` | bug | closed | image.startup concurrent-context test counts a late health-poll request line |
| `d1y` | task | closed | tRPC module gate refuses a whole mixed batch when one module is disabled |
| `dm9` | task | closed | Health probe: bound the connection wait so a packet-dropping database cannot exhaust the pool |
| `dwn` | bug | closed | Release: keep the registry token away from processes left by install |
| `hvl` | chore | closed | Setup follow-ups from 1ia.4 review: findings 3-7 |
| `i5j` | bug | closed | Image ships public/public/: Dockerfile cp -r into an existing public/ |
| `kj0` | bug | closed | tRPC error envelope: HTTP status and appCode disagree |
| `l65` | task | closed | Event bus: propagate correlationId from the causing request or event |
| `lg9s` | chore | closed | Stack template: upgrade Keycloak 26.4 to 26.7.x |
| `mli` | task | closed | Event bus review follow-ups (1ia.10 re-review lows) |
| `sl1` | bug | closed | Release: gate tags on a green develop run, sign in to GHCR only after smoke |
| `vpe` | bug | closed | Generated-module proof: stream each step's output with a header and a per-step timeout |
| `zwv` | bug | closed | Setup gate breaks next dev HMR before setup |

Read a ticket's full scope and acceptance with `bd show <bead>`.
