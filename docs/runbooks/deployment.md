# Deployment guide

Status: 2026-09-17. This guide tells an operator how to run Genie Ops Center for one customer, which hosting mode to choose, and what changes when the count of customers grows. It uses only Docker, Docker Compose, and the tools inside the image. A deployment panel can wrap these steps, but the steps do not depend on one. Decisions behind this guide: ADR 0007, `DEC-33`, `DEC-35`, `DEC-36`.

## The shape of one deployment

Diagram: `../architecture/diagrams/platform-architecture.html` (source `platform-architecture.architecture.json`). The setup steps below are drawn in `../architecture/diagrams/customer-setup.html` (source `customer-setup.workflow.json`).

The steps in this guide are the reference and the fallback. Normal operation will be automated later, and the automation runs the same script, compose file, and commands as this guide with no step of its own (`DEC-38`, `OPEN-7`). Every customer runs its own deployment. A deployment is one image, one Postgres database, and one Keycloak realm. The image carries core plus that customer's modules and nothing else. The image holds no secret. Every secret and every host value comes from `.env` at run time (`../architecture/environment-contract.md`).

A stack is three containers from the same image plus Keycloak:

- The application, on `PORT` behind the reverse proxy.
- The job worker, started with the worker entrypoint flag.
- `genie-ops`, run on demand with `docker compose exec` (`DEC-14`).
- Keycloak, from the stack template, unless the customer already runs a Keycloak server.

Postgres, the mail server, and the reverse proxy with the certificate are supplied by the host. They are not part of the stack.

## Choose the hosting mode

The hosting mode changes no code, no command, and no configuration file. It decides who does the operator work. Record it in the customer's runbook, never in `tenant.yaml` (`DEC-35`).

| Mode | Where the stack runs | Who upgrades | Who holds the break-glass password | Who backs up | Choose it when |
| --- | --- | --- | --- | --- | --- |
| Genie-hosted | Genie's servers | Genie | Genie | Genie | The customer has no infrastructure requirement. |
| Customer-hosted, Genie-managed | The customer's infrastructure | Genie, over SSH access that the customer grants | Genie | The customer's platform team, by agreement | The customer requires its own region or premises but wants Genie to operate the product. This is the mode for the first customer. |
| Customer-hosted, customer-managed | The customer's infrastructure | The customer, by pulling the next tag | The customer | The customer | The customer does not grant Genie access. Support is by this guide and release notes. |

## What the count of customers changes

Up to about twenty customers, every stack is set up and upgraded by hand with the steps in this guide. One host can run several Genie-hosted stacks side by side, each with its own database, realm, and `.env`. Upgrade work grows with the count of stacks, so keep a list of every stack and its current version in the runbooks folder.

Around a hundred customers, upgrade work by hand becomes the bottleneck. ADR 0007 records two paths, and neither is started before the count demands it:

1. Keep one deployment per customer and add a rollout tool. Kubernetes with one namespace per customer applies the same image tag to every namespace in one command. The Helm values file in `customers/<slug>/deploy/` exists for this path.
2. Return to many customers in one process. Every read of the database, settings, branding, and files goes through the tenant context (`DEC-34`), so this path changes how the context is built and nothing else. It needs a new ADR, because it brings back the shared database server and the isolation tests it requires.

## Before you start

Make sure that the target host has the following. The customer's platform team supplies them in a customer-hosted mode.

- Docker with the Compose plugin.
- A Postgres database and a role that owns it. The image creates every table.
- A mail server or a mail provider account, for the invitation and notification emails. Setup and the first administrator's sign-in send no email, so this can arrive after setup, but it must be configured before the first "Add person" that sends an invitation (checked by default, Specification 02 R-40a). A local-accounts realm sends its set-password email through the realm's own SMTP settings, not through this mailer.
- A public hostname with a certificate at the reverse proxy. This hostname is `PUBLIC_URL` (`DEC-19`). A host that has no reverse proxy sets one up with `reverse-proxy.md` before the stack starts; a host that has one, or a cloud load balancer, applies the rules in that runbook's last section. The proxy must let a streamed response stay open for hours on `/api/m/solutions/chat`, because a chat solution can run a workflow for that long. The application writes a keepalive line to the browser every 20 seconds while the upstream is silent, so a proxy or an edge in front of it needs an idle timeout above 20 seconds, not an unlimited one; a DNS provider's proxied mode (about 100 seconds between bytes on most plans) and a cloud load balancer (60 seconds on some) are both fine with that. Make sure that no hop in the path buffers responses of type `text/event-stream`.
- A Keycloak server, if the customer already runs one. If not, the stack template starts one under the `bundled-keycloak` profile, and its database must exist before the first start.
- A decision on file storage. The default keeps file bytes in the database. A customer who wants their own bucket, or files above 15 MB, sets `FILE_STORAGE_ADAPTER=s3` and the `S3_*` variables in `.env` before setup, and can then raise `FILE_MAX_BYTES` (`DEC-44`). Choose before go-live, because a later switch needs `genie-ops files migrate`, which is not built yet (`DEC-20`).
- A read-only token for the customer's image on the registry, or the image file for a host without internet access.

## Set up a new customer

1. In the repository, run `nx g @genie/generators:tenant-new <slug>`. It creates `customers/<slug>/deploy/` with `tenant.yaml`, `modules.txt`, `realm.overrides.json`, `branding.seed.json`, `compose.yaml`, `.env.example`, and `values.yaml`.
2. Fill `tenant.yaml`: the module list, the onboarding mode, `local_accounts`, the realm mode (`realm: managed` by default, `customer` for client-only mode, ADR 0010), the first administrators, and the break-glass email. Every field is read by the generator or by setup (`DEC-35`, `DEC-36`). Keep the onboarding mode at `invite` unless the customer asked for `jit`. In `jit` mode a person the provider lets sign in gets an active account only when their `groups` claim holds a group mapped to a Genie Ops Center role (`DEC-7`, `../architecture/access-model.md`, "Who may sign in the first time"). Before a customer switches to `jit`, map their groups (add them before first sign-in if needed, `DEC-52`), and make sure that the customer restricted the application assignment in their provider to the people who must have access.
3. Run `scripts/build-customer-image.sh <slug> <version>`. It builds the image with the customer's module list and pushes `ghcr.io/<org>/genie-<slug>:<version>`. For a host without internet access, run `docker save` on the image and hand over the file.
4. Copy `compose.yaml`, `tenant.yaml`, `branding.seed.json` and `realm.overrides.json` to the host, into one stack folder. They are committed and hold no secret and no host value. `realm.overrides.json` is the customer's realm delta; setup reads it beside `tenant.yaml` and refuses when it is missing, so it must travel with them.
5. On the host, copy `.env.example` to `.env` and fill every value. Never commit `.env`. Keep it readable by the operator account only. Keep `COMPOSE_PROFILES=bundled-keycloak` only when the stack runs its own Keycloak; otherwise remove it and set `KEYCLOAK_URL` to the realm's server (Specification 02 R-54b).
6. Run `docker compose pull`, or `docker load` from the image file, then `docker compose up -d`. With the `bundled-keycloak` profile only: before the first `up`, create the `KC_DB_URL_DATABASE` database (default `keycloak`) on the host Postgres for the `KC_DB_USERNAME` role, and set `KC_PROXY_TRUSTED_ADDRESSES` to the proxy's address (`reverse-proxy.md`, step 7). Keycloak runs in production mode behind the reverse proxy and serves `KEYCLOAK_URL`. `docker compose ps` shows it `healthy` once `/health/ready` answers on its unpublished management port 9000. The first start can take a minute or two.

   Enable the profile only through `COMPOSE_PROFILES` in `.env`, never with `docker compose --profile` on a command line, and never start the `keycloak` service by name (as the administrator step below does) unless `COMPOSE_PROFILES` holds `bundled-keycloak`. The compose file passes `COMPOSE_PROFILES` to the application as `STACK_PROFILES`, and the start-up guard of Specification 02 R-54c reads only `STACK_PROFILES`; it cannot see a profile enabled with `--profile` or a service started by name, so the guard would disagree with the running stack.

   With the `bundled-keycloak` profile only: on the first deploy, create the Keycloak server administrator. Type the two values into the shell of this one command. Never write them to `.env` or to a file (R-66):

   ```bash
   read -r KC_TEMP_ADMIN_NAME
   read -rs KC_TEMP_ADMIN_PASSWORD
   export KC_TEMP_ADMIN_NAME KC_TEMP_ADMIN_PASSWORD
   docker compose run --rm -e KC_CACHE=local \
     -e KC_TEMP_ADMIN_NAME -e KC_TEMP_ADMIN_PASSWORD \
     keycloak bootstrap-admin user \
     --username:env KC_TEMP_ADMIN_NAME \
     --password:env KC_TEMP_ADMIN_PASSWORD
   unset KC_TEMP_ADMIN_NAME KC_TEMP_ADMIN_PASSWORD
   ```

   Do not use the names `KC_BOOTSTRAP_ADMIN_USERNAME` and `KC_BOOTSTRAP_ADMIN_PASSWORD` here. Keycloak reads those names at its own start, creates the user, and then the command fails because the user exists. `KC_CACHE=local` keeps the one-off container out of the running server's cache cluster; `bootstrap-admin user` has no `--cache` option. The account is temporary. Replace it with a named administrator after setup (`keycloak-realm.md`, "Keycloak server hardening").
7. Open `PUBLIC_URL`. The application migrates the database at start and shows the not-set-up page until setup runs.
8. In managed mode, run setup with a Keycloak server administrator credential in the environment of that one command. In client-only mode, run the same command without the two `KEYCLOAK_BOOTSTRAP_*` variables. Copy the three configuration files into the app container, then pass their container paths to setup:

   ```sh
   docker compose cp tenant.yaml app:/tmp/tenant.yaml
   docker compose cp branding.seed.json app:/tmp/branding.seed.json
   docker compose cp realm.overrides.json app:/tmp/realm.overrides.json
   docker compose exec -e KEYCLOAK_BOOTSTRAP_USER=admin -e KEYCLOAK_BOOTSTRAP_PASSWORD='...' app genie-ops setup --tenant-config /tmp/tenant.yaml --branding-seed /tmp/branding.seed.json
   ```

   Setup uses the credential for the realm step only and never writes it anywhere (`DEC-37`). Do not put these two variables in `.env`. In a customer-hosted mode, the customer's platform team types the credential, so Genie never holds it. In managed mode setup creates the realm from the template and the clients; in both modes it creates the system roles, the first administrators as pending people, one `tenant_module` row per module, the branding seed, and the break-glass account.
9. Setup prints the break-glass password once. Store it in the secret store of whoever holds it in the chosen hosting mode. Do not write it anywhere else.
10. If the customer has an identity provider, add it with `genie-ops idp set` (next section). If `local_accounts` is on, or in client-only mode, skip this step.
11. Sign in at `PUBLIC_URL/admin/login` with the break-glass account. Change the password and enroll the authenticator app.
12. Ask one first administrator to sign in through the identity provider. Setup pre-added them as a pending person and sent no invitation, and this first sign-in activates them. Make sure that they land in the workspace and that the admin switch shows in their menu.
13. Record the host, the database, the mail server, the Keycloak server, the hosting mode, and the image version in the customer's runbook.

Setup is resumable. If a step fails, fix the cause and run the same command again. It continues from the failed step (`setup_step` in `../architecture/data-shape.md`). A rerun after the realm step does not need the bootstrap credential. In client-only mode setup never needs it.

## Add the identity provider

The protocol and the credentials of the customer's identity provider are not in any file in the repository. Run `docker compose exec app genie-ops idp set` with `--protocol oidc` (plus `--issuer-url`, `--client-id`, `--client-secret`) or `--protocol saml` (plus `--metadata-url`, `--entity-id`). The command writes the provider into the realm under the fixed alias `company-login`, which the realm template already names as the browser flow's default redirector, and creates the mapper that fills the `groups` claim with a sync mode that clears it when the provider sends no groups. LDAP federation is deferred; the command refuses any other protocol. The customer must register `PUBLIC_URL/api/auth/callback/keycloak` and the realm's broker endpoint on their side. The runbook for the realm lists the exact values per protocol. Ask the customer to emit only the groups assigned to the application in the token. Microsoft Entra ID sends no `groups` claim for a person in more than 200 groups, and Genie Ops Center then keeps that person's previous memberships and writes an audit event (`DEC-41`).

## Upgrade

1. Build and push the new version with the build script, or hand over the new image file.
2. On the host, change `IMAGE_TAG` in `.env` to the new version.
3. Run `docker compose pull` and `docker compose up -d`.
4. The new container applies the migration histories under one lock before it serves. If a migration fails, the container stays unhealthy and the previous version keeps serving. Read the container log, fix the cause, and repeat step 3.
5. If the release notes name a new `genie-ops setup` step, run `docker compose exec app genie-ops setup` again. Until that run completes, the application shows the not-set-up page, because setup is complete only when every step the running image knows is done, or skipped in client-only mode (`../core/roadmap.md`, Section 1 items 2 and 5).
6. A module that the new image adds arrives disabled. An administrator configures it and enables it on the Modules page, or you run `docker compose exec app genie-ops module enable <module-id>` on the administrator's request. Nobody gets access to it until then (`DEC-50`).

Every release upgrades from the last three releases (`DEC-9`). A customer-managed stack that is more than three releases behind must upgrade through an intermediate release. Release notes name the oldest release that each version upgrades from. The migrator logs the count of pending migrations at start, so read that line after an upgrade of a stack that was behind (`DEC-43`).

## Recovery by scenario

Three accounts exist with different jobs. A tenant administrator is a normal person with the `Tenant administrator` role, who signs in through the identity provider and passes every permission check. The break-glass account is one emergency account per deployment, with a password and an authenticator app, reachable only at `PUBLIC_URL/admin/login`, that never uses the identity provider and bypasses every permission check. The `genie-ops` commands run on the host and need no sign-in at all.

| Problem | What to do | Why this one |
| --- | --- | --- |
| The last administrator left the company or was disabled at the identity provider. Other people still sign in. | `genie-ops admin add <email>` (next section). | One scoped action, audited, no unchecked session. |
| Same problem, but you cannot reach the host command line. | Break-glass sign-in, then People, then give the role. | The only path left that does not need the host. |
| Nobody can sign in, administrators included. The identity provider is down, misconfigured, or the realm is broken. | Break-glass sign-in to reach the admin screens, and `genie-ops idp set` on the host to fix the provider. | Only the break-glass account signs in without the provider. |
| The person who holds the break-glass password left. | `genie-ops break-glass rotate` (`DEC-24`). | New password, authenticator cleared, sessions ended. |
| The break-glass authenticator is lost. | `genie-ops break-glass rotate`. | Same command, same result. |
| A setup step failed. | Fix the cause and run `genie-ops setup` again. | Setup resumes from the failed step. |
| The container refuses to start and the log names a module that the image omits. | Deploy the image that includes that module again. If the deployment never went live, you can instead drop the database, create an empty one, start the corrected image and run setup. | The check deletes nothing. A module counts as installed once its row or its migration ledger exists, even when a first boot used the wrong image, and removing an installed module needs controlled removal, which is not built yet ([diagram](../architecture/diagrams/module-omission-check.html)). |
| The worker log shows a job moved to a dead-letter queue, or a serialized key stops moving with no move line (pg-boss expired the job). | Read the error, fix the cause, then retry the job from the dead-letter queue or delete it. Ask the queue for `getBlockedKeys` to see the keys the dead or expired job still holds. | A failed or expired job on a serialized key blocks every later job for that key until it is retried or deleted. pg-boss moves an expired job itself, so that move has no worker line; `getBlockedKeys` is how you find it. |

Use the break-glass account only for the rows that name it, and sign out as soon as the fix is done. Every action in that session bypasses the permission checks (`DEC-15`).

## Recover a customer with no administrator

This happens when the last person with the `Tenant administrator` role left the company or was disabled at the identity provider. Act only on a written request from the customer that names the new administrator.

Recommended: on the host, run the following command. It adds the person to `Genie Administrators`, and their next sign-in through the identity provider gives them the role.

```sh
docker compose exec app genie-ops admin add alice@example.com
```

Alternative, only when you cannot reach the host command line: the holder of the break-glass password signs in at `PUBLIC_URL/admin/login`, opens People, and gives the person the `Tenant administrator` role. Sign out of the break-glass account as soon as this is done. Every action in that session bypasses the permission checks (`DEC-15`).

Both paths write an audit event. Record the request and the date in the customer's runbook. In a customer-managed mode the customer's platform team does this, because Genie has no access. If the person who holds the break-glass password leaves, run `genie-ops break-glass rotate` instead (`DEC-24`).

## A customer who already runs Keycloak

Supported. Point `KEYCLOAK_URL` at the customer's server and run setup as usual. Setup creates a fresh Genie Ops Center realm there from the template. The customer's existing identity provider is then added to that realm with `genie-ops idp set`, so their people still sign in once with the account they already have.

This fresh realm is the default. A customer that refuses a second realm can instead choose client-only mode (ADR 0010, `DEC-36` as amended 2026-09-27): the customer imports the two client files for Genie Ops Center and genie-studio into its existing realm, and setup creates no realm, no clients, and no admin service client. The realm template's guarantees then become the customer's duties: a short realm session, brute-force protection, and the forward to their company login. Local accounts, `genie-ops idp set`, and deleting the realm user on erasure are not available in that mode. Sign-out in Genie Ops Center ends its own session only, so the person stays signed in to the company's other apps; tell the customer's IT. The procedure is written with Section 2; until then, use the fresh realm.

## Backups

Back up the database and `.env`. The image is rebuilt from the repository. A brokered realm is recreated by setup from the template plus `realm.overrides.json`, so it needs no backup, but a realm export after setup shortens a restore. If `local_accounts` is on, back up the Keycloak database as well. That realm holds the people's passwords and second factors (`DEC-10`), and the template cannot recreate them. A Genie-hosted database gets a nightly logical backup kept for 30 days (`DEC-31`). A customer-managed stack backs up on its own schedule. Test a restore on a second host before go-live, and every quarter after that.

## Logs

Logs stay on the host. Every service in the generated compose file uses Docker's `json-file` driver with rotation, 50 MB per file and 20 files per container, so a container keeps about 1 GB of recent log (`DEC-31`). Read them with `docker compose logs app`, `docker compose logs worker`, or the host's own tools. Every line is JSON with a request id, and an error shown to a person carries the same request id, so search for that id first. No line holds a secret, a session token, or an emailed link. A customer-managed stack sends Genie nothing; attach the relevant lines to a support request.

The application, the worker, and `genie-ops` write the same JSON lines with the tenant id (`PUBLIC_URL`) on each. The framework's own lines in the application, such as its start banner, are JSON with `"source":"framework"`. Three lines are plain text on stderr, because each one is written before a valid environment gives the process a tenant id:

- `genie-ops: unknown or invalid command. Usage: ...`, the refusal for a command line that does not parse.
- `genie-ops: <cause>`, when the environment of a `genie-ops` run is invalid.
- `worker: <cause>`, when the worker's environment is invalid.

An invalid environment in the application writes one JSON line with no tenant id and exits. The image launcher also writes plain text on stderr when it finds no single `server.js` or an unknown entrypoint.

## Retire a customer

Stop the stack with `docker compose down`. Keep the database, the realm, and the last backup for 90 days. After the hold, run `genie-ops retire --confirm` against the database to delete what Genie holds (`DEC-17`). A customer-managed stack retires itself. Genie deletes only what Genie holds, such as the image on the registry.
