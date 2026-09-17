# Environment contract

The image reads its configuration from environment variables and refuses to start when a required value is missing or malformed. Validation runs before any database connection (`core/roadmap.md`, Section 0, item 5). Values the tenant administrator owns live in `tenant_settings` and `tenant_branding`, never here. A deployment serves one customer (ADR 0007), so every value here describes that one customer's stack. This file is the planning contract; `deploy/stack/.env.example` is generated from the same schema and stays in step with it.

## Required

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | Postgres URL of the deployment's one database. |
| `PUBLIC_URL` | The one public address, for example `https://genie.example.com`. Cookies, callbacks, and email links derive from it. The application never inspects the request hostname (`DEC-19`). |
| `BETTER_AUTH_SECRET` | Random string, at least 32 characters. Signs session cookies. |
| `KEYCLOAK_URL` | Base URL of the Keycloak server that holds this customer's realm. |
| `KEYCLOAK_REALM` | The realm name. |
| `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET` | The `genie-ops-center` client in the realm, used for sign-in. |
| `KEYCLOAK_ADMIN_CLIENT_ID`, `KEYCLOAK_ADMIN_CLIENT_SECRET` | The `genie-admin` service client in the realm, used by setup, local-account creation, set-password emails, and the realm display name at provisioning (`DEC-40`). It has rights in this realm only. |
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
| `AUTH_TRUSTED_PROXIES` | empty | Comma-separated proxy addresses or CIDR ranges trusted for `X-Forwarded-For`. Never `0.0.0.0/0`. |
| `LOCK_TIMEOUT_MS` | `120000` | Wait limit for the migration advisory lock at start (`DEC-9`). |
| `LOG_LEVEL` | `info` | pino level. |
| `PORT` | `3000` | Container listening port. |
| `NODE_ENV` | set by the image | Not overridden in deployments. |

## Read by Docker Compose, not the image

| Variable | Default | Meaning |
|---|---|---|
| `IMAGE_TAG` | none, required | The version of the customer image that the generated compose file pulls, as `${IMAGE_TAG}` in its `image:` line. An upgrade changes this value and restarts the stack (`runbooks/deployment.md`). The application never reads it. |

## Build argument, not a variable

| Argument | Default | Meaning |
| --- | --- | --- |
| `MODULE_INCLUDE` | all, for development and CI only | Comma-separated module ids compiled into the image (`DEC-33`). Every customer build passes an explicit list. The registry file is generated from it and excluded modules are absent from the image. Read by `docker build`, never at run time. |

## Rules

- The image holds no credential and no secret. Every secret enters at run time from the environment. `MODULE_INCLUDE` is the only build argument, because a build argument stays readable in the image history, and an image is passed to customers and stored in a registry.
- A secret is read once at start and never logged, echoed in an error, or returned by the health endpoint.
- A value that is a list (`GENIE_CHAT_API_ALLOWED_ORIGINS`, `AUTH_TRUSTED_PROXIES`) is parsed and each entry validated at start, so a typo fails the boot and not a request.
- The compose file in `customers/<slug>/deploy/` is committed and holds no secret and no host-specific value; `.env` is never committed and holds every secret and host-specific value.
- Adding a variable means adding it to the schema, to this file, and to the generated example in the same pull request.
