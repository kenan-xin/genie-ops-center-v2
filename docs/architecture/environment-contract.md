# Environment contract

The image reads its configuration from environment variables and refuses to start when a required value is missing or malformed. Validation runs before any database connection (`core/roadmap.md`, Section 0, item 5). Values the tenant administrator owns live in `tenant_settings` and `tenant_branding`, never here. A deployment serves one customer (ADR 0007), so every value here describes that one customer's stack. This file is the planning contract; `deploy/stack/.env.example` is generated from the same schema and stays in step with it.

## Build and runtime lifecycle

Deployment values are runtime inputs, not prerequisites for compiling or assembling the image. Build-time imports may load schema definitions and module declarations but must not parse deployment environment values, create a tenant context, connect to deployment services, or prerender tenant data. `MODULE_INCLUDE` remains the only build argument. See `../specs/00-monorepo-foundation.md` R-19a/R-19b and AC-26 for the lifecycle and proof.

At runtime, validate applicable values before any database connection. Applicability follows the selected entrypoint, command step, and provider: realm bootstrap credentials belong only to the setup realm-creation step; mail and storage credentials follow their provider conditions. An unset chat allow-list disables streaming, not startup. Configuration validation is not a probe that requires setup to have already provisioned the realm. The application must be able to serve the Section 1 not-set-up page after migrations, and setup must be able to provision an unfinished deployment. Fixed environment members are read at runtime initialization; settings, branding, and entitlements remain the changing context readers of `DEC-46`.

## Required

Required means required by the consuming runtime/feature below, not by every image entrypoint. All profiles derive from one schema catalogue; do not duplicate schemas or deployment values. A feature adds its requirements when its roadmap section delivers the runtime consumer, not merely when Section 0 declares its types.

| Validation profile | Applicable requirements and boundary |
| --- | --- |
| Build, registry generation, generators | No deployment runtime values, database, identity service, or tenant context. Generators validate input files with build-safe core schemas. |
| Section 0 application | `DATABASE_URL`, `PUBLIC_URL`, and applicable defaulted/list values. No Better Auth or Keycloak credentials. |
| Section 1+ application | Application profile plus implemented file/mail provider conditions. Section 2 adds the authentication requirements below. Schema readiness permits serving before customer setup is complete. |
| Section 1+ worker | `DATABASE_URL` and configuration consumed by its implemented context services and registered jobs, such as `PUBLIC_URL` for generated links and selected mail/file adapter credentials. No listener, browser sign-in client, or bootstrap credential merely because it shares the image. Later job-specific identity-service needs must be declared with that consumer. |
| `genie-ops` command | `DATABASE_URL` and values consumed by that command and its context services. No HTTP listener or job-consumption loop. `migrate` must not require sign-in/realm credentials. Setup validates seed inputs and the requirements of the steps it actually runs. |

| Variable group | Runtime/feature applicability |
| --- | --- |
| `DATABASE_URL` | Application, worker, and database-backed operator commands; never build. |
| `PUBLIC_URL` | Application from Section 0; workers/commands that generate public links or provision redirect URIs. |
| `BETTER_AUTH_SECRET` | Section 2 authentication runtime and commands that use its cryptographic services; not Section 0/1, the standalone migrator, or a worker without that consumer. |
| `KEYCLOAK_URL`, `KEYCLOAK_REALM` | Section 2 application identity integration and commands/jobs that call or provision that realm. |
| `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET` | Section 2 application sign-in and the setup realm step that provisions this client. |
| `KEYCLOAK_ADMIN_CLIENT_ID`, `KEYCLOAK_ADMIN_CLIENT_SECRET` | Section 2 application realm-management operations and operator steps/commands that provision or use the service client; not every CLI command or worker. |
| `KEYCLOAK_BOOTSTRAP_USER`, `KEYCLOAK_BOOTSTRAP_PASSWORD` | Only the pending setup realm-creation step. Never app/worker startup, build, `.env`, or generated `.env.example`; a rerun after that step completes does not require them. |

Validate the selected runtime's startup requirements and the shape of supplied applicable values before connecting. A command may then read `setup_step` to determine which conditional steps remain: check a pending step's required credentials before that step's external calls or writes, not before the database read that discovers whether the step is needed. Missing bootstrap credentials fail the pending realm step with its resumable failure reporting; they do not block a completed step or the not-set-up application. Integration secrets named dynamically by `secret_ref` retain Section 1 R-41's call-time resolution; do not replace it with a full startup enumeration.

The table below defines the values; the tables above define when each is required.

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | Postgres URL of the deployment's one database. |
| `PUBLIC_URL` | The one public address, for example `https://genie.example.com`. Cookies, callbacks, and email links derive from it. The application never inspects the request hostname (`DEC-19`). |
| `BETTER_AUTH_SECRET` | Random string, at least 32 characters. Signs session cookies. |
| `KEYCLOAK_URL` | Base URL of the Keycloak server that holds this customer's realm. |
| `KEYCLOAK_REALM` | The realm name. |
| `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET` | The `genie-ops-center` client in the realm, used for sign-in. |
| `KEYCLOAK_ADMIN_CLIENT_ID`, `KEYCLOAK_ADMIN_CLIENT_SECRET` | The `genie-admin` service client in the realm, used by every setup step after the realm exists, by `genie-ops idp set`, and by local-account creation and set-password emails. It holds realm-management roles in this realm only, for user management, reading clients, and identity provider configuration (`../runbooks/keycloak-realm.md`). The three clients with their secrets and redirect URIs, the realm display name, and the SMTP settings are written at realm creation with the bootstrap credential (`DEC-37`, `DEC-40`). |
| `KEYCLOAK_BOOTSTRAP_USER`, `KEYCLOAK_BOOTSTRAP_PASSWORD` | A Keycloak server administrator, read by `genie-ops setup` for the realm-creation step only. Passed in the environment of that one command, never written to `.env` (`DEC-37`). Not read by the application. |

## Mail

| Variable | Meaning |
| --- | --- |
| `MAIL_PROVIDER` | `resend` or `smtp`. Unset means no mailer: in production every action that must send an email fails before it writes anything, and in development the link is logged instead (`core/roadmap.md`, Section 1, item 8). Not needed for `genie-ops setup`, `genie-ops admin add`, or the first administrator's sign-in, none of which send an email. |
| `MAIL_FROM` | Sender address on a domain the provider has verified. The display name comes from `tenant_branding.email_sender_name`. |
| `RESEND_API_KEY` | Required when `MAIL_PROVIDER=resend`. |
| `SMTP_URL` | Required when `MAIL_PROVIDER=smtp`; `smtps://user:pass@host:465` form. |

## Files

| Variable | Default | Meaning |
| --- | --- | --- |
| `FILE_STORAGE_ADAPTER` | `postgres` | `postgres` stores bytes in `file_blob`; `s3`, `gcs`, or `azure` store them in a bucket through FlyDrive, each with its own variables added when that store is built (`DEC-20`). |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | unset | Required when the adapter is `s3`. `S3_ENDPOINT` is for an S3-compatible service such as MinIO. |
| `FILE_MAX_BYTES` | `15728640` (15 MB) | Largest accepted upload. Startup validation rejects a value above the default unless `FILE_STORAGE_ADAPTER` is `s3` (`DEC-44`). |

## Optional

| Variable | Default | Meaning |
| --- | --- | --- |
| `GENIE_CHAT_API_ALLOWED_ORIGINS` | empty | Comma-separated HTTPS origins the chat proxy may call. Empty disables chat streaming for the deployment (`DEC-30`). |
| `AUTH_TRUSTED_PROXIES` | empty | Comma-separated proxy addresses or CIDR ranges trusted for `X-Forwarded-For`, fed to the Better Auth instance's trusted proxy list so the session's stored address is the client's and not the proxy's. Empty means the header is ignored. Never `0.0.0.0/0`. On a host set up with `../runbooks/reverse-proxy.md` it is the `proxy` network subnet. |
| `LOCK_TIMEOUT_MS` | `120000` | Wait limit for the migration advisory lock at start (`DEC-9`). |
| `LOG_LEVEL` | `info` | pino level. |
| `WORKER_HEARTBEAT_PATH` | `/tmp/genie-worker-heartbeat` | Worker only. The file the core heartbeat job rewrites every minute after a database round trip. The worker container health check reads its age (D-10). |
| `PORT` | `3000` | Container listening port. |
| `NODE_ENV` | set by the image | Not overridden in deployments. |

## Read by Docker Compose, not the image

| Variable | Default | Meaning |
|---|---|---|
| `IMAGE_TAG` | none, required | The version of the customer image that the generated compose file pulls, as `${IMAGE_TAG}` in its `image:` line. An upgrade changes this value and restarts the stack (`runbooks/deployment.md`). The application never reads it. |
| `KEYCLOAK_URL` | none, required | The Keycloak public address, for example `https://id.example.com`. The compose file passes it to the Keycloak service as `KC_HOSTNAME`, so Keycloak builds its issuer and redirects from it and never from a request host (`runbooks/reverse-proxy.md`). Section 2 also reads it in the application. |
| `KC_DB` | `postgres` | Keycloak's database vendor. Keycloak runs in production mode (`start`) with its own database. |
| `KC_DB_URL_HOST` | none, required | The host of the host-supplied Postgres that holds the Keycloak database. |
| `KC_DB_URL_PORT` | `5432` | The port of that Postgres server. |
| `KC_DB_URL_DATABASE` | `keycloak` | The Keycloak database, beside the application database on the same server. Create it before the first start. |
| `KC_DB_USERNAME`, `KC_DB_PASSWORD` | none, required | The Postgres role Keycloak connects as. The password is a secret and stays in `.env`. |
| `KC_PROXY_HEADERS` | `xforwarded` | Keycloak trusts the reverse proxy's `X-Forwarded-*` headers, because the proxy terminates HTTPS (`DEC-19`). |
| `KC_PROXY_TRUSTED_ADDRESSES` | blank, not set | The proxy's address, from which alone Keycloak accepts forwarded headers. Blank trusts every peer on the `proxy` network (`runbooks/reverse-proxy.md`, step 7). |

The Keycloak server administrator is not in `.env`. The operator creates it once with `docker compose run --rm keycloak bootstrap-admin user` on the first deploy (`runbooks/deployment.md`).

## Build argument, not a variable

| Argument | Default | Meaning |
| --- | --- | --- |
| `MODULE_INCLUDE` | all, for development and CI only | Comma-separated module ids compiled into the image (`DEC-33`). Every customer build passes an explicit list. The registry file is generated from it and excluded modules are absent from the image. Read by `docker build`, never at run time. |

## Rules

- The image holds no credential and no secret. Every secret enters at run time from the environment. `MODULE_INCLUDE` is the only build argument, because a build argument stays readable in the image history, and an image is passed to customers and stored in a registry.
- Fixed runtime secrets are read at initialization of their consuming runtime. Setup-only credentials are consumed by their applicable step, and integration `secret_ref` values use the core call-time resolver. Secrets are never logged, echoed in an error, or returned by the health endpoint.
- A value that is a list (`GENIE_CHAT_API_ALLOWED_ORIGINS`, `AUTH_TRUSTED_PROXIES`) is parsed and each entry validated at start, so a typo fails the boot and not a request.
- The compose file in `customers/<slug>/deploy/` is committed and holds no secret and no host-specific value; `.env` is never committed and holds every secret and host-specific value.
- Adding a variable means adding it to the schema, to this file, and to the generated example in the same pull request.
