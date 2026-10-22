Confidence: 7.1/10
Reasoning: The owner decisions of 2026-10-20 settle every question that the review of the same day left to the owner, and each requirement below traces to a decision, a roadmap item, or a recorded cross-section call. No runbook in this section has run on a real host yet, so the first deployment of R-28a is also the first real test of every procedure here. Two procedures are stated but not proved: the restore of one realm from a Keycloak server that serves several realms (R-20), and the execution of `genie-ops retire --confirm`, whose design gates (R-32a) can still change a requirement. Documents outside this specification still state the old upgrade rule until their own change ("Review findings and answers", "Not changed here"). `OPEN-7` is a deliberate deferral and does not lower the score, because `DEC-38` fixes the manual path as the reference.
Status: Draft, reworked 2026-10-20, awaiting user approval

## Goal and scope

Section 5 makes a deployment operable. It delivers the operator documents, the delivery and upgrade paths, the backup and restore regime, and the small amount of code that offboarding needs. Its goal is that a new Genie-hosted customer reaches a running deployment in one working day and a customer-hosted one in one week (`../core/roadmap.md`, Section 5, goal). R-8a defines how both times are measured.

In scope: the new-customer runbook, the three hosting runbooks with their delivery paths and the per-customer checklist, health checks and log shipping, the backup set with the recovery targets and the quarterly restore drill, the upgrade path, controlled module removal and reintroduction, the cross-product step for genie-studio, the environments and the first deployment, offboarding, and the tracked list of later capabilities.

Out of scope and owned elsewhere:

- The commands themselves. `genie-ops setup`, `idp set`, `admin add`, `module enable|disable`, `break-glass rotate`, and `migrate` are built in Sections 1 and 2 (`../specs/README.md`, "Section boundaries", row `genie-ops`). Section 5 documents them and proves them on a real host.
- The realm template and the identity provider procedure. The realm runbook is `../runbooks/keycloak-realm.md`.
- The automation tool for setup and upgrade. `OPEN-7` defers it. This specification specifies no panel-specific step and chooses no tool.
- Logging, error responses, and security headers, which are Section 0 (`DEC-31`).
- The release workflow files. R-23 states the rule for release tags, and the change to the workflow belongs to its own ticket (Beads `3ui`).

Boundary with the sections before it: Section 5 runs beside the others from Section 1 onward (`../core/roadmap.md`, "Order and parallelism"). Every runbook it writes depends on a command that Section 1 or Section 2 already shipped, so a runbook is written only after the command it documents passes its own section's definition of done.

Boundary with what comes after: nothing in the core roadmap follows Section 5. Item 8 is a tracked list, not committed work.

Core knows no module (vision principle 9). Every runbook and every lifecycle command in this section works on a deployment whose image holds no business module, and no requirement here names a module except as an example of a module in general.

## Owner decisions of 2026-10-20

The review of this specification on 2026-10-20 left five questions to the owner. The owner answered them, and two earlier owner decisions apply as well.

| Decision | Where it is recorded | Requirements |
| --- | --- | --- |
| An upgrade is a short planned maintenance window. A failed migration rolls back its transaction, and the operator restarts the previous image by a documented step. No zero-downtime design. | `DEC-9` amended 2026-10-20 (`../core/vision.md`), `DEC-33` amended 2026-10-20 (`../core/decision-log.md`) | R-16, R-24, R-26, AC-4 |
| Every deployment whose realm Genie manages backs up its Keycloak database together with the application database, and restores them together. A brokered realm is no longer recreated by setup. File bytes of the `s3` adapter and the identity provider inputs are in the backup set. The restore drill loses the real hosts. | `DEC-31` amended 2026-10-20 | R-18 to R-21b, AC-3 |
| After a customer is retired, the contract sets how long the last backup is kept, and each retirement plan names that period. No default period exists. | `DEC-17` amended 2026-10-20 | R-31, R-32a, AC-7 |
| Erasing a person removes their data only. Blocking a future sign-in is the job of the customer's identity provider. No identity tombstone is kept. | `DEC-17` amended 2026-10-20 | R-36a, AC-7 |
| The first deployment is Genie's own internal deployment, with every module, for demo and testing. It signs in through the Keycloak server on sso.001.gs. The Keycloak hardening checklist is confirmed on that deployment (Beads `d8l5.24`, Spec 2 AC-14). | Beads `d8l5.24` | R-28a, R-46 |
| The tenant generator stops writing Helm values (owner, 2026-10-19). | Beads `2xfl` | R-26a, R-40 |
| A release tag must point at a commit on `main`. | Beads `3ui` | R-23 |

## Sources

- `../core/roadmap.md`, Section 5, items 1 to 8 and the goal. Section 0 items 5 and 8 (the build script and the release-tag pipeline), Section 1 items 1, 4, 5, 6, 10 and 11, Section 2 items 9, 9a and 10, and "Order and parallelism".
- `../core/vision.md`: "Who it serves" (the Genie operator), principle 9, "Features / Deployment (operators only)", the Decided table, `OPEN-7`, `OPEN-10`, `OPEN-11`, and `OPEN-12`.
- `../core/decision-log.md`: `DEC-7`, `DEC-14`, `DEC-15`, `DEC-16`, `DEC-17`, `DEC-18`, `DEC-19`, `DEC-20`, `DEC-21`, `DEC-23`, `DEC-24`, `DEC-29` as amended 2026-10-20, `DEC-31`, `DEC-32`, `DEC-33`, `DEC-35`, `DEC-36`, `DEC-37`, `DEC-38`, `DEC-41`, `DEC-43`, `DEC-45`, `DEC-50`, `DEC-52`. `DEC-8` and `DEC-9` from the Decided table of `../core/vision.md`.
- `../adr/0007-one-deployment-per-customer.md`, `../adr/0002-keycloak-realm-per-tenant.md`, `../adr/0010-client-only-mode-in-an-existing-realm.md`, and `../adr/0011-replace-trpc-with-orpc.md`.
- `../specs/README.md`, "Cross-section calls made in the drafting round", for the health endpoint, the `genie-ops retire` split, and the image push split.
- `../runbooks/README.md` and `../runbooks/deployment.md`, which is the reference path (`DEC-38`). `../runbooks/keycloak-realm.md`, the realm and identity provider procedure, including `genie_studio_url` and the client files of client-only mode. Neither runbook has run against a real host yet.
- `../architecture/environment-contract.md`, `../architecture/repository-layout.md` (`customers/<slug>/`, `deploy/`, `scripts/`), `../architecture/data-shape.md` (`retirement`, `audit_event`, `setup_step`, `tenant_settings.realm_mode`, `file`, and the `user` erasure sentence), `../architecture/access-model.md`, `../architecture/permission-evolution.md`, `../architecture/module-removal.md`, `../flows/module-access-upgrades.md`, and `../core/tech-stack.md` ("Delivery").
- Beads items linked from the requirements: `6nm` and `3pu` (controlled removal and its release gate), `hum7` (deprovisioning sync), `w5a4` (the genie-studio cutover), `d8l5.24` (the hardening checklist), `r0q6` (output schemas before REST), `2xfl` (no Helm values), and `3ui` (release tags on `main`).

## Terms

- Realm mode: the value of `tenant_settings.realm_mode` that setup records from `tenant.yaml`. `managed` means that setup created the realm. `customer` means client-only mode in the customer's existing realm (ADR 0010).
- Backup set: every item that R-18 lists for one deployment, taken in one backup run.
- Retirement plan: the reviewed list of R-32a that names each resource that retirement deletes or keeps.

## Requirements

### The runbook set and the automation seam

R-1. Section 5 delivers one runbook per procedure, all under `../runbooks/`, all naming no customer: the new-customer runbook, one runbook per hosting mode, the upgrade runbook, the backup and restore runbook, and the retirement runbook. `../runbooks/deployment.md` stays the single reference that the others link to for the steps they share, and no runbook repeats a step that `deployment.md` already holds (`../runbooks/README.md`).

R-2. No runbook step depends on a deployment panel. Every step is a command that a person can type: `nx g @genie/generators:tenant-new`, `scripts/build-customer-image.sh`, `docker compose`, and `genie-ops` (`DEC-38`, `../runbooks/deployment.md`, "The shape of one deployment"). A runbook names a panel only as one way to reach a host, and only where the same paragraph gives the equivalent command.

R-3. The automation seam stays open and unfilled. Whatever tool `OPEN-7` later chooses runs the same build script, the same compose file, and the same `genie-ops` commands with no step of its own, so a runbook written now stays complete (`DEC-38`). No requirement here names or assumes a tool.

R-4. Every runbook carries a status date and the release it was last rehearsed against, so a reader can tell whether it drifted.

R-4a. Every runbook step that touches a realm states what it does in each realm mode. A step that applies to one mode only says so, and a step for the `managed` mode never runs against a realm whose recorded mode is `customer` (ADR 0010).

### Item 1: the new-customer runbook

R-5. The new-customer runbook covers the path from the filled checklist to the go-live checklist of R-7c, in this order (`../core/roadmap.md`, Section 5, item 1, and `../runbooks/deployment.md`, "Set up a new customer"):

1. Run `nx g @genie/generators:tenant-new <slug>`.
2. Fill `tenant.yaml` and `branding.seed.json`. If the customer runs genie-studio as well, set `genie_studio_url` now, before the first setup (R-27).
3. Run `scripts/build-customer-image.sh <slug> <version>`, then deliver and run the stack.
4. Run `genie-ops setup`. In the `managed` mode, pass the bootstrap credential in the environment of that one command (`DEC-37`). In the `customer` mode, setup needs no bootstrap credential.
5. Set the identity provider with `genie-ops idp set`. Skip this step if `local_accounts` is on (`DEC-36`) or the realm mode is `customer` (ADR 0010).
6. Run the smoke test of R-7 and the go-live checklist of R-7c.
7. Hand branding to the tenant administrator.

R-6. The runbook states which of its steps the customer must do and which Genie must do, per hosting mode and per realm mode. In a customer-hosted mode the customer's platform team types the Keycloak server administrator credential, and Genie never holds it (`DEC-37`). In the `customer` realm mode the customer's IT imports the two client files and returns the client secret (`../runbooks/keycloak-realm.md`, "Client files (client-only mode)").

R-7. The runbook names the smoke test explicitly:

1. The not-set-up page is gone, and the health endpoint reports `ok`.
2. The break-glass account signs in at `PUBLIC_URL/admin/login` and completes the forced password change and authenticator enrollment (`DEC-24`).
3. One first administrator signs in through the identity provider and lands in the workspace with the admin switch visible (`DEC-23`).
4. An excluded module has no route (`DEC-33`).
5. Sign-out ends both sessions in the `managed` mode and the Genie Ops Center session only in the `customer` mode (`DEC-11`, ADR 0010).

R-7a. The runbook states the failure path for setup. Setup is resumable through `setup_step`, so the operator fixes a failed step and runs the same command again. A rerun after the realm step does not need the bootstrap credential (`DEC-37`, `../architecture/data-shape.md`, "Deployment tables"). The runbook forbids any manual repair of a half-finished realm.

R-7b. The runbook covers the customer who already runs a Keycloak server. `KEYCLOAK_URL` points at that server, and setup creates a fresh Genie Ops Center realm on it by default. A customer that refuses a second realm uses the `customer` mode. It imports the two client files into its existing realm and keeps the realm duties that ADR 0010 lists. The runbook states which operator steps that mode skips and which commands it lacks (`DEC-36` as amended 2026-09-27, ADR 0010).

R-7c. The go-live checklist proves that members, not only an administrator, get the access the customer expects. The operator and a tenant administrator run it with the customer's identity provider before the deployment carries production data:

1. The administrator adds one directory group by its exact `groups` claim value and maps it to a role before any member signs in. For Microsoft Entra ID the value is the group's object ID (`DEC-52`).
2. A member of that group signs in. Under `jit` the member is admitted with the mapped role. Under `invite` the member is admitted only after an administrator pre-added them (`DEC-7`, `../architecture/access-model.md`).
3. A person in no mapped group is refused with the not-registered message, and an audit event is written.
4. A member whose token carries an empty group list keeps no directory memberships. A member whose token carries no `groups` claim keeps the previous memberships, and the audit log records `auth:groups_claim_absent` (`DEC-41`).
5. In the `customer` mode, the customer's IT restricted who reaches the client before `jit` is switched on (ADR 0010).
6. If the customer runs genie-studio as well, the checks of R-27 pass.

R-8. The runbook ends by requiring that the operator record the deployment facts in the per-customer record of R-11 and in the deployment inventory of R-30. The facts include the realm mode, the Keycloak server, the file adapter, and the date of the go-live checklist.

R-8a. One timing rule applies to both goal targets. The clock starts when the operator holds a filled checklist and the customer's identity provider details. The clock stops when the go-live checklist of R-7c passes. Waits on the other party, such as the customer registering the callback URL at their identity provider, are recorded separately and excluded, because no runbook controls them. AC-9 and AC-10 measure by this rule.

### Item 2: the three hosting runbooks, delivery, and the checklist

R-9. One runbook per hosting mode, each stating only what differs: who runs the host, who upgrades, who holds the break-glass password, who takes the backup set, and whether Genie reaches the host (`DEC-33`, `../runbooks/deployment.md`, "Choose the hosting mode"). The three modes are Genie-hosted, customer-hosted and Genie-managed, and customer-hosted and customer-managed. The hosting mode changes no code, no command, and no configuration file, and each runbook says so.

R-10. Two delivery paths, both documented in every hosting runbook (`DEC-33`):

1. Registry. One private image per customer at `ghcr.io/<org>/genie-<slug>:<version>`. The customer receives credentials that can read that one image and nothing else.
2. Release file. For a site with no internet access, `docker save` produces a file that is attached to a private release, and the site loads it with `docker load`. The runbook records the image digest beside the file, so the receiving site can compare it with what it loaded.

R-11. The per-customer checklist is recorded in that customer's runbook record and never in `tenant.yaml`, because no code reads it (`DEC-35`). It holds the hosting mode, the target host, Postgres, SMTP, the Keycloak server and the realm mode, object storage if any, the delivery path of R-10, and who takes the backup set. The record is `customers/<slug>/runbook.md`, created from a customer-free template under `../runbooks/`, because a customer slug is allowed in `customers/` and not under `docs/` (`DEC-35` as amended 2026-09-18, `../architecture/repository-layout.md`).

R-12. Section 5 delivers a checklist template that names no customer. The template is the only copy in `docs/`.

R-13. The release pipeline completes the delivery path. Section 0 item 8 builds one image per customer folder on a release tag and pushes it. Section 5 owns the per-customer read token, package access, the release file, and the runbooks (`../specs/README.md`, "Cross-section calls", row "Image push on release tag"). Section 5 adds what makes an image reachable by a customer. The operator first detaches the package from repository-inherited permissions, then grants the per-customer read credential on that one package. A release file is produced and attached for every customer whose delivery path is the file (`DEC-33`). The pipeline calls `scripts/build-customer-image.sh` and adds no build logic of its own.

R-14. A customer's read credential is revoked as part of retirement (R-32a) and is rotated on the customer's request. The runbook names both.

### Item 3: health checks, log shipping, and backups

R-15. Every Genie-operated stack is polled on `GET /api/health`, which is unauthenticated and returns only `ok` or `degraded` and never error text (`../specs/README.md`, "Cross-section calls", row "Health endpoint", and `../core/roadmap.md`, Section 1, item 4). An alert fires when a stack reports `degraded` or fails to answer for more than five minutes. Amended 2026-09-23: the endpoint answers HTTP 503 while the database is unreachable (Spec 1 R-11), and a 503 alerts the same way as no answer.

R-15a. Genie has no access to a customer-managed stack, so its runbook states what the customer must watch and why: the health endpoint, the container restart count, the disk the database sits on, and the backup job. It also states what the customer must send Genie when they ask for support, which is the container log around the failure and the image version, and that the log carries no secret by design (`DEC-31`, `DEC-33`).

R-16. The stack template's application and worker services carry a container health check. A container whose migration failed never becomes healthy, and nothing serves until the operator acts by R-26 (`DEC-9` as amended 2026-10-20). Amended 2026-09-23: the worker serves no HTTP, so it writes a heartbeat file inside its container after each successful database round trip of its job loop. Its container health check fails when that file is older than a fixed limit. The heartbeat is not a `genie-ops` command, so it writes no audit row (Spec 1 R-64). It also catches a worker whose job loop hangs. The application keeps the HTTP check on `/api/health`.

R-17. Logs stay on the host. The stack template sets the `json-file` log driver on every service with rotation at 50 MB per file and 20 files per container. The hosting runbooks say who reads the logs and how, with `docker compose logs` or the host's tools. No log aggregation service exists in any hosting mode. Logs are pino JSON with request, tenant, and user ids, and they carry no secret, no session token, and no emailed link (`DEC-31` as amended 2026-09-18, `../core/roadmap.md`, Section 0, item 10).

R-18. The backup set of one deployment holds these items, taken in one backup run (`DEC-31` as amended 2026-10-20):

1. The application database, as a nightly logical backup kept 30 days.
2. The Keycloak database, when the realm mode is `managed`. The run takes it directly after the application database, and both carry the same run time. R-20 covers a Keycloak server that serves several realms.
3. The file bytes, when the file adapter is `s3`. The bucket has object versioning on, and noncurrent versions are kept 30 days, so a restore can take each object as it was at the run time.
4. `.env` and the break-glass password, in the operator's secret store.
5. The identity provider inputs: the protocol, the issuer or metadata URL, the client id or entity id, and the callback URLs that the customer registered. These are in the customer's record. The client secret is in the secret store.

The run writes every item outside the host it protects and encrypts it at rest. The restore of R-21 proves the backup, not a job that reports success. In the `customer` realm mode the realm belongs to the customer's IT, and the backup set holds the client id and the client secret that the customer returned.

R-19. In a customer-managed deployment the customer takes the same backup set. The backup runbook states each item and why it is needed. The image is not in the set, because Genie rebuilds it from the repository for the recorded version.

R-20. A Keycloak server that serves several realms, such as Genie's shared server, is backed up whole in every backup run of every deployment on it. A restore after the server itself is lost restores the whole Keycloak database. A restore of one deployment while the shared server keeps serving the other realms follows this procedure (owner choice, 2026-10-20). The procedure is unproven until the drill of R-21 proves it, and the first deployment on a shared server does not rely on it before then:

1. Restore the Keycloak database backup into a separate, stopped Keycloak server.
2. Export that one realm with its users from the stopped server with `kc.sh export --realm <realm> --users realm_file`.
3. Delete the realm on the shared server through the Admin API.
4. Import the exported file into the shared server.

Keycloak recommends that every node is stopped during `kc.sh export`, and it recommends a delete through the Admin API before an import over an existing realm. That is why step 1 uses a separate server.

R-21. The restore drill runs every quarter on the staging stack of the demo customer (`DEC-31`, `DEC-18`). It assumes that the application host, its Postgres, and its Keycloak server are lost. The drill uses new hosts, the repository, and the backup set only:

1. Restore the application database and the Keycloak database from the same run, or the realm by R-20.
2. Restore the bucket to the run time when the adapter is `s3`.
3. Restore `.env` from the secret store, and point `PUBLIC_URL` at the new host.
4. Start the same image version, and make sure that `genie-ops setup` reports every step done and changes nothing.
5. Prove that the break-glass account and a member sign in through the identity provider.
6. Prove that the member's role still grants its permission and that a permission the member lacks is still refused.
7. Prove that the audit rows up to the run time survived and that a file uploaded before the run downloads with the same checksum.

The drill records the elapsed time and compares it with the recovery time target. A drill that is not recorded did not happen. Before the first deployment with the `s3` adapter goes live, one drill runs on a staging stack set to `s3`.

R-21a. The application database and the Keycloak database are restored together, from the same run. A restored application database marks the realm steps done, and setup never reruns a done step, so a missing or older realm stays missing or older (`../architecture/data-shape.md`, `setup_step`).

R-21b. Recreating a lost realm by clearing `setup_step` rows and running setup again is not a recovery path. It is a last resort only when no Keycloak backup exists, and the runbook states what it loses: local accounts, second factors, the federated identity links, and every change since setup.

R-22. Default targets until a customer contract states others: recovery point 24 hours and recovery time 8 hours (`DEC-31`). The backup runbook states that a nightly backup meets the 24 hour recovery point only at its worst case. A customer that needs better gets a shorter interval written into their record.

### Item 4: the upgrade path

R-23. A release tag builds every customer image, one build per customer folder with that customer's include list (`../core/roadmap.md`, Section 0, item 8, and `DEC-33`). A release tag must point at a commit on `main`, and a tag on any other commit builds and publishes nothing (Beads `3ui`). A build that fails for one customer does not block the others. The release is not announced until every customer build passed typecheck and the smoke test.

R-24. An upgrade is a short planned maintenance window, and it is the same in every hosting mode (`DEC-9` as amended 2026-10-20). The runbook states these steps:

1. Announce the window to the tenant administrators.
2. Take a backup set by R-18 and record its run time.
3. Change `IMAGE_TAG` in `.env`.
4. Pull, and bring the stack up.

The application is unavailable from step 4 until the new container is healthy, because the stack has one application container and `docker compose up -d` replaces it (`../architecture/environment-contract.md`, "Read by Docker Compose, not the image", `../runbooks/deployment.md`, "Upgrade"). A Genie-operated stack can be upgraded through a panel that performs those same steps. A customer-managed stack pulls the next tag itself.

R-24a. An upgrade has one more step when the release notes name a new `genie-ops setup` step: run `genie-ops setup` again. Until that run completes, the application shows the not-set-up page, because setup is complete only when every step the running image knows is done, or skipped in the `customer` mode (`../runbooks/deployment.md`, "Upgrade", step 5). The upgrade runbook requires reading the release notes for that line before the pull.

R-24b. The release notes and the upgrade runbook cover the module and permission lifecycle (`DEC-50`, `../architecture/permission-evolution.md`, `../flows/module-access-upgrades.md`):

1. The release notes name each module that the release adds, each permission transformation (a rename, a revocation, or a role rename) with its effect, and each removal of unsafe authority.
2. After the upgrade, the operator makes sure that a newly compiled module shows as disabled on the Modules page. Nobody reaches it until an administrator configures it and enables it explicitly.
3. The operator makes sure that each named transformation wrote one `core:permission_transformation` audit row.
4. The operator makes sure that a member's access is the same as before the upgrade, except for the revocations that the release notes name.

R-25. Every release upgrades from the last three releases (`DEC-9`, `DEC-43`). The lagging-stack rule: a stack more than three releases behind upgrades through the intermediate releases one at a time, in order. The release notes name the oldest release that each version upgrades from. The runbook requires reading the pending-migration count that the migrator logs at start, after upgrading a stack that was behind (`DEC-43`).

R-26. A failed migration rolls back its transaction, and the new container never becomes healthy (`DEC-9` as amended 2026-10-20). The upgrade runbook's recovery is these steps, inside the same window:

1. Read the container log and record the cause.
2. Set `IMAGE_TAG` back to the previous version, and bring the stack up again.
3. Make sure that the previous version is healthy, then close the window.
4. Fix the cause and plan a new window.

The previous image can start, because a history that committed before the failure holds only expand migrations, or contract migrations whose release gap a reviewer confirmed (`DEC-43`). If the previous image refuses to start, restore the backup set of R-24 step 2. That case includes a module that the new release added, because its committed history makes it an installed module, and the omission check refuses an image without it (Spec 1 R-79).

R-26a. The rollout path for many stacks is tracked, not built. Kubernetes with one namespace per customer and a rollout tool is the named path when the count of stacks makes upgrading by hand the bottleneck, at around a hundred customers (ADR 0007, `../runbooks/deployment.md`, "What the count of customers changes"). Section 5 writes no Kubernetes procedure. The tenant generator writes no Helm values (owner, 2026-10-19, Beads `2xfl`), and Helm values return with the first Kubernetes customer. The entry lives in the tracked list of R-40.

R-26b. This section builds controlled removal and reintroduction (`../core/roadmap.md`, Section 5 item 4a), as [Module removal and reintroduction](../architecture/module-removal.md) and business flows CF-MA-10 to CF-MA-12 define them (Beads `6nm`). Until that work and its tests pass, the Section 1 omission check keeps rejecting upgrades that drop an installed module. Exclusions from a fresh image stay supported. Controlled removal requires disablement, accounted-for active and queued work and dependencies, stopped schedules, revoked module-specific inbound credentials, and durable completion evidence before an image without the module is deployed. Tenant data, applied migration history, configuration, roles, assignments, and audit are kept. An incomplete prerequisite fails with an actionable message. Nothing is purged, cancelled, or activated implicitly. The lifecycle matrix (Beads `3pu`, Spec 1 AC-19a) is the release gate for this work.

R-26c. Reintroduction uses the same stable identity and compatible retained history, supported forward migrations, the disabled state, administrator review of retained grants, and explicit enablement. Revoked credentials need a separate reissue, and work never resumes silently. Permanent deletion of module data is a separate operator procedure that needs explicit authorization. It names the exact data and files, the retention, the exports and backups, the references, the retained audit, and whether it can be undone. This specification authorizes no deletion command and borrows no tenant-retirement timer.

Received from Section 3 (2026-10-22). The owner moved Section 3 R-84b and AC-14a here after the spec 03 critique (decision F-23 in [Section 3, "Revision of 2026-10-22"](03-shell-branding-and-design-system.md#revision-of-2026-10-22)). They are the core admin review screens for a module that was removed and brought back (CF-MA-10 to CF-MA-11). Historical grants show that the module is not installed, without the module's code. A reintroduced module stays disabled and shows its retained configuration and grants for review before an explicit enable. They are built with controlled removal above (bead `6nm`), with phone and desktop end-to-end proof. Section 3 keeps R-84a, the disabled first arrival of a new module.

### Item 5: the cross-product step

R-27. For a customer that runs both products, the new-customer runbook carries the genie-studio step (`DEC-8`, `../core/roadmap.md`, Section 2, item 9). The realm side belongs to `../runbooks/keycloak-realm.md`.

1. First setup in the `managed` mode. `genie_studio_url` in `tenant.yaml` is set before the first `genie-ops setup`, so the realm step writes the `genie-studio` redirect URI and post-logout redirect. The operator then configures that customer's genie-studio deployment with the realm issuer and the `genie-studio` client credentials.
2. Later change in the `managed` mode. A done realm step does not rerun when `genie_studio_url` changes. The operator follows the repair procedure of `../runbooks/keycloak-realm.md`, which reruns the realm and clients steps with a one-run bootstrap credential (`DEC-37`).
3. The `customer` mode. Setup does not apply `genie_studio_url`. The customer's IT imports the `genie-studio` client file with the redirect from genie-studio's own configuration and returns its credentials (ADR 0010).
4. Check. A member signs in to each product and signs out of each, and each sign-out returns to that product. Each product decides its own admission (`DEC-7` as amended 2026-09-27).

Moving an existing genie-studio deployment to a new realm on sso.001.gs is a live walk-through with the owner, never an unattended step (Beads `w5a4`).

### Item 6: environments and the first deployment

R-28. Genie runs a demo customer as three Genie-hosted stacks, dev, staging, and production, each with its own database and realm, set up by the same commands with no special mode in code (`DEC-18`). The staging stack is the target of the restore drill (R-21) and of every rehearsal (R-41).

R-28a. The first deployment is Genie's own internal deployment, with every module, for demo and testing. It is Genie-hosted (owner, 2026-10-20), so its rehearsal counts against AC-9. It signs in through the Keycloak server on sso.001.gs, which also serves other realms, so R-20 applies to it. It is the first real host for the new-customer runbook, the go-live checklist of R-7c, the backup set, and the Keycloak hardening checklist of R-46. A runbook finding on this deployment is fixed in the runbook before a customer deployment starts.

R-29. A customer's UAT is a second stack of that customer, with its own database and realm, on Genie's staging servers or on the customer's own (`DEC-18`). It gets its own row in the deployment inventory and its own entry in the customer's record.

R-30. Genie keeps one deployment inventory that lists every stack, its customer slug, its hosting mode, its realm mode, its environment, and its current image version. `DEC-43` relies on this inventory to make a lagging stack visible, which is why no `release` table exists. Every setup and every upgrade updates it.

### Item 7: offboarding

R-31. Section 1 item 10 ships `genie-ops retire`, the `retirement` row, and the refusal rules. Section 5 ships `--confirm` deletion after the hold, the deletion hold, the retirement plan, and personal erasure (`../specs/README.md`, "Cross-section calls", row "`genie-ops retire`"). `genie-ops retire` records the retirement in the single `retirement` row with `retired_at` and leaves `deletion_hold` false (`../architecture/data-shape.md`, "Deployment tables", and `DEC-17`). The operator then stops the stack. The database, the realm that Genie owns, and the bucket are kept for 90 days. The last backup set is kept for the period that the customer's contract names, and the retirement plan names that period. No default period exists, so a retirement plan without the period is not approved (`DEC-17` as amended 2026-10-20).

R-32. `genie-ops retire --confirm` deletes the resources that the approved retirement plan lists. It refuses before 90 days passed since `retired_at`, and it refuses while `deletion_hold` is set, with a message that names which of the two refused it. Nothing runs on a schedule, so the deletion is always an operator action (`DEC-17`, `../architecture/data-shape.md`).

R-32a. The retirement plan and the execution contract of `--confirm` are design gates. Section 5 settles each gate in its technical plan before it builds the command:

1. Ownership. The plan lists only the resources that the deployment records show Genie created: the database, the realm when `tenant_settings.realm_mode` is `managed`, the bucket when the adapter is `s3`, the image package, and the read credential of R-14. In the `customer` mode no realm is listed, and the customer's IT removes the two clients (ADR 0010). The realm is listed on the server named by `keycloak_url_at_setup`.
2. Review. `--confirm` first prints the plan and deletes nothing until the operator confirms it in the same run. The operator records the approved plan in the customer's record.
3. One-run credentials. Deleting a realm needs Keycloak server administrator rights, and deleting a bucket needs delete rights on it. Each credential enters the environment of that one run, like the bootstrap credential of `DEC-37`, and is never written to `.env`, a file, or a log. On a customer's Keycloak server the customer's platform team types it.
4. Order and partial failure. The command deletes the resources outside the database first, and it writes one audit row per resource while the database still exists. The database is deleted last. A rerun after a partial failure skips a resource that is already gone, and a resource that is already gone is not an error.
5. Outcome after the database is gone. The command prints the outcome of each step, and the operator pastes that output into the customer's record (`DEC-45`).
6. The last backup set. It stays for the period of R-31. At the end of that period the operator deletes it by hand and records the date in the customer's record.

R-33. The deletion hold is set and cleared by an operator and is visible in the retirement row. A legal hold, a dispute, or an unfinished data export are the reasons the runbook names.

R-34. A customer-managed deployment retires itself. Genie deletes only what Genie holds: the image on the registry, the read credential of R-14, and the realm when the recorded realm mode is `managed` and the realm lives on Genie's Keycloak server (`DEC-17`, ADR 0007, ADR 0010).

R-35. Personal erasure anonymizes one person and keeps the audit trail. It sets `user.erased_at`, replaces `name` with `Erased person`, replaces `email` with `erased-<id>@invalid`, clears `image`, sets `banned`, and deletes that person's account and session rows. Every other column, the id, and the audit events that name the id stay (`../architecture/data-shape.md`, `user`, and `DEC-17`).

R-36. In the `managed` realm mode, erasure also deletes the person's user record in the realm through the `genie-admin` client. A local-accounts realm holds their name, email, password, and second factor. A brokered realm holds a local user record with the imported name and email and the federated identity link. An anonymized application row alone does not erase them (`DEC-17` as amended 2026-09-18, `DEC-10`, ADR 0006). The realm delete runs first, so an unreachable realm fails the command before the application row changes. A realm that has no record for the email, because the person never signed in, is not an error. In the `customer` mode the command makes no realm call, and the customer's IT removes the realm user (ADR 0010). The person's account at the customer's identity provider is never touched.

R-36a. Erasure removes the person's data only. It does not block a future sign-in, and no identity tombstone is kept (`DEC-17` as amended 2026-10-20). The confirmation text that `genie-ops erase` prints and the runbook both state that blocking a future sign-in is the job of the customer's identity provider: remove the person from the application assignment, or disable the account. A later sign-in by the same person is a first sign-in of a new person (`../architecture/access-model.md`, "Who may sign in the first time"):

- Under `invite`, it is refused with the not-registered message unless an administrator pre-added the person again.
- Under `jit`, it creates a new `user` row when the `groups` claim holds a mapped group. The erased row is not reused, and no direct role assignment of the erased row returns.

R-37. Erasure runs only on a written request that names the person. The runbook requires recording the request and the date in the customer's record, by the same rule that governs administrator recovery (`DEC-23`). Erasure cannot be undone, and the runbook says so before the command.

R-38. Every `genie-ops` command in this section writes one `audit_event` row through the command runner's helper: `actor_user_id` null, `action` `ops:<command>`, and the operating-system user, the non-secret arguments, and the outcome in `metadata` (`DEC-45`). The final delete of `retire --confirm` cannot write a row, because it removes the database that holds the table. R-32a covers that case, and `DEC-45` already names the exception.

R-39. The interface of erasure is `genie-ops erase <email>`, run on the customer's written request, and no screen erases a person (`DEC-14` as amended 2026-09-18). The command writes one `audit_event` row like every other command (`DEC-45`). It refuses an email that matches no `user` row or a row already erased, and it refuses the break-glass account.

### Item 8: later capabilities, tracked and not scheduled

R-40. Section 5 keeps one tracked list of later capabilities. Each entry carries the trigger that reopens it and the guard that keeps the path open. Nothing on the list is scheduled, estimated, or started by this section, and an entry moves off the list only through its own decision. An entry can link a deferred Beads item that records the decision work.

| Capability | Trigger that reopens it | Guard that keeps the path open |
| --- | --- | --- |
| SCIM provisioning and push deprovisioning | A customer requires push-based joiners and leavers (`../core/vision.md`, "Non-goals"). Decision work: Beads `hum7`. | Groups arrive through one normalized claim and one sync function in core (`DEC-41`) |
| Keycloak page and email branding per realm | A customer names it (`DEC-32`), and `DEC-40` holds the current answer | The realm display name is set at provisioning from `branding.seed.json`, and no branding value is written to the realm (`DEC-40`) |
| Audit CSV export and SIEM push | A customer names a retention period shorter than lifetime or a specific SIEM (`DEC-16`) | `audit_event` is append-only and read behind `core:audit:read` (`DEC-16`) |
| ClamAV upload scanning | A customer requires malware scanning (`DEC-20`) | `file.scan_status` exists from the first migration, and a scanner flips it with no migration (`DEC-20`) |
| Notifications page and header bell | Roadmap Section 6 item 5 (`DEC-21`) | The `notification` table is written from Section 2 by the same events that send email (`DEC-21`) |
| Support impersonation with consent | Support load demands it (`DEC-15`) | `session.impersonated_by` exists, and a later feature must record the tenant administrator's consent in audit (`DEC-15`) |
| Operator console | The number of deployments makes the command line error-prone, or a non-engineer must operate it (`DEC-14`) | Every operator action is a `genie-ops` command that writes an audit row (`DEC-45`) |
| Kubernetes rollout for many stacks | The count of stacks makes the current host slow, at around a hundred customers (ADR 0007, `../runbooks/deployment.md`) | One image per customer, configuration only from the environment, and one generated compose file with no branch per hosting mode. Helm values return with the first Kubernetes customer (Beads `2xfl`). |
| REST API for machine callers | `OPEN-10` closes | No public REST endpoint ships until it closes (ADR 0011). Real output schemas come first (Beads `r0q6`). |
| Named datasets for analytics and the boss agent | `OPEN-11` closes | Analytics does not start, and the boss agent reads module data only through read tools that each module writes by hand (`DEC-29`) |
| The boss agent of `DEC-29` as amended 2026-10-20 | Each part of `OPEN-12` closes in the agent's specification | The agent is off. No model connection setting, document library, or agent tool ships until its part closes. The agent works with zero modules and finds tools only through the capabilities registry. |

R-40a. No runbook and no lifecycle command in this section depends on a business module. Setup, upgrade, backup, restore, and retirement run on an image whose include list holds no business module (vision principle 9).

### Rehearsal

R-41. A runbook is not done when it reads correctly. It is done when a person who did not write it follows it start to finish on the staging stack of the demo customer, types no step that the runbook does not contain, and reaches the stated end state. The rehearsal records the elapsed time, every step whose text was wrong or incomplete, and every step the reader had to guess. Each finding is fixed in the runbook before the section closes.

### Cross-cutting operator rules

R-42. Every hosting runbook opens with the host prerequisites and states who supplies each one: Docker with the Compose plugin, a Postgres database and a role that owns it, a mail server or provider account, a public hostname with a certificate at the reverse proxy, and a Keycloak server if the customer runs one (`../runbooks/deployment.md`, "Before you start"). It also states the one proxy rule that a default configuration breaks: a streamed response on a chat route must be allowed to stay open for hours with no read or idle timeout.

R-43. The file storage adapter is chosen before go-live and recorded in the customer's record. The runbook states why. The adapter is read from the environment at setup and stays for the life of the deployment, and a later switch needs `genie-ops files migrate`, which is not built (`DEC-20`, `DEC-44`). The adapter also decides whether the backup set holds the bucket (R-18).

R-44. Custody of the break-glass password follows the hosting mode, and each hosting runbook names the holder and the secret store. Genie holds it for a Genie-hosted stack and for a customer-hosted and Genie-managed stack. The customer holds it for a customer-hosted and customer-managed stack (`DEC-33`). Setup prints the password once, and the runbook forbids writing it anywhere but that store (`DEC-24`).

R-45. The runbook requires `genie-ops break-glass rotate` when the holder of the password leaves or when the authenticator is lost, and records the rotation in the customer's record (`DEC-24`). It repeats the rule that a break-glass session bypasses every permission check and is used only for the scenarios that name it (`DEC-15`).

R-46. Each hosting runbook points at the Keycloak hardening checklist of `../runbooks/keycloak-realm.md` (Section 2 item 10, Spec 2 AC-14), and at the same runbook for the realm and identity provider procedure. The checklist is confirmed first on the first deployment of R-28a and recorded in Beads `d8l5.24`. A deployment does not carry production data on a Keycloak server whose checklist is not confirmed. The operator runs the realm runbook at setup and at every identity provider change. Section 5 adds nothing to either procedure.

## Acceptance criteria

AC-1 (item 1). A rehearsal of the new-customer runbook on the staging stack reaches a passed go-live checklist with no step outside the runbook. The smoke test of R-7 and the go-live checklist of R-7c pass in full, in each realm mode that a deployment uses. A deliberately failed setup step is recovered by rerunning the same command with no manual repair. Proves R-4a, R-5, R-6, R-7, R-7a, R-7b, R-7c, R-8, R-41.

AC-2 (item 2). A reviewer opens each of the three hosting runbooks and finds, in each, the five ownership answers of R-9, both delivery paths of R-10, and the checklist template of R-12. A rehearsal delivers one image by the registry path and one by the `docker save` path, and a host with no access to the registry runs the release file. A reviewer finds the host prerequisites of R-42, the adapter rule of R-43, and the break-glass custody line of R-44 in each of the three. Proves R-9 to R-14 and R-42 to R-45.

AC-3 (item 3). A quarterly drill by R-21 restores a full backup set onto new hosts and passes every proof of R-21, and the recorded elapsed time is compared with the 8 hour recovery time target. One drill restores one realm by the procedure of R-20 while the shared server keeps serving, and a second realm on that server is unchanged after it. One drill runs with the `s3` adapter before the first `s3` deployment goes live. A `degraded` health response on a monitored stack raises an alert within five minutes. A reviewer finds the backup set of R-18 and the last-resort warning of R-21b in the backup runbook. The customer-managed runbook names what the customer must watch. Proves R-15, R-15a, R-16 to R-22.

AC-4 (item 4). A release tag on a commit on `main` produces one image per customer folder, and a reviewer confirms that the release workflow refuses a tag on any other commit. A staging stack three releases behind upgrades to the new release in one window. A stack four releases behind is refused by the runbook rule and upgrades through the intermediate release instead. A forced migration failure rolls back, the new container never becomes healthy, and the documented step of R-26 brings the previous version back to healthy inside the window. A release that adds a setup step is not complete until `genie-ops setup` is rerun, and the not-set-up page shows until it is. A release that adds a module and a permission transformation passes the checks of R-24b. Proves R-23, R-24, R-24a, R-24b, R-25, R-26, R-26a.

AC-5 (item 5). In the `managed` mode, a first setup with `genie_studio_url` set gives the `genie-studio` client its redirect URI and post-logout redirect. A later change to the field takes effect only through the repair procedure of R-27. A member signs in to both products and signs out of each, and each sign-out returns to its own product. A reviewer confirms that the step for the `customer` mode uses the client file and that the step links to `../runbooks/keycloak-realm.md`. Proves R-27.

AC-6 (item 6). Three stacks of the demo customer exist, dev, staging, and production, each with its own database and realm, each created by the same commands. A second stack of one customer stands as UAT and appears in the inventory with its realm mode. The first deployment of R-28a ran the go-live checklist and the hardening checklist, and both are recorded. Proves R-28, R-28a, R-29, R-30, R-46.

AC-7 (item 7). On a disposable database:

1. `genie-ops retire` writes the `retirement` row.
2. `genie-ops retire --confirm` is refused before 90 days and refused again with `deletion_hold` set, each refusal naming its reason. After both conditions clear, it prints the plan before it deletes anything.
3. With the realm mode `customer`, the plan lists no realm and the command makes no realm call.
4. A run that fails after the first resource is rerun, skips what is already gone, and completes.
5. A reviewer confirms that a retirement plan without the contract's backup period is not approved.
6. `genie-ops erase <email>` produces exactly the column changes of R-35 and keeps that person's audit events under the same id. In the `managed` mode it removes the person's realm record on both realm variants and tolerates a realm with no such record. In the `customer` mode it makes no realm call.
7. `genie-ops erase` refuses an unknown email, an erased row, and the break-glass account, and its confirmation text names the identity provider's job of R-36a.
8. After erasure, a sign-in by the same person behaves as R-36a states under `invite` and under `jit`, in both realm modes.

Every command run leaves one `audit_event` row except the final delete, which prints its outcome. Proves R-31 to R-39.

AC-8 (item 8). The tracked list holds all eleven capabilities, and every row carries a trigger and a guard that cite a decision or an open item. No entry has an owner, an estimate, or a schedule. An entry can link a deferred Beads item. Every lifecycle command of this section runs on an image with no business module. Proves R-40, R-40a.

AC-9 (goal, Genie-hosted). A rehearsal on Genie's own infrastructure meets the one working day target, measured by R-8a, and the elapsed time is recorded. Proves R-5 to R-8a and R-41 against the first time target.

AC-10 (goal, customer-hosted). A rehearsal against a host that stands in for a customer's infrastructure, including the credential handover of R-6 and the delivery path of R-10, meets the one week target, measured by R-8a. The record separates Genie's work from the waits on the other party. Proves R-6, R-8a, R-9, R-10, R-41 against the second time target.

AC-11 (module lifecycle). The [removal-policy matrix](../architecture/module-removal.md) is mandatory proof for R-26b, R-26c, and CF-MA-10 to CF-MA-12. Before removal support exists, a test proves that an installed module's omission is rejected against a populated database. Before removal support is enabled, a rehearsal runs install, grants, records, disable, controlled removal, reintroduce, review, and enable. It includes unresolved work, integration revocation, incompatible history, concurrent attempts, and failure and retry at every transition. It asserts retained data and unrelated authority, no silent resumption, no credential revival, and no implicit purge. It records operator outcomes and parity between the screen and the command line. When the Solutions module exists, the matrix runs with real Solutions records, files, and scoped and broad grants. An unauthorized omission is refused. After controlled removal, no Solutions routes or code remain in the image, and retained records survive. Reintroduction stays disabled, and review plus explicit enablement restores only valid remaining access (moved from Section 4 AC-5a, 2026-10-19). These are required tests, not executed evidence (Beads `3pu`, `6nm`).

## Verification

Unit tests (Vitest). The 90 day arithmetic of `retire --confirm` at its boundary, the refusal while `deletion_hold` is set, the plan that the realm mode and the file adapter produce, and the field-by-field result of the erasure transform.

Integration tests (Vitest with Testcontainers, a real Postgres and the real migration histories, never a mock). `genie-ops retire` writes exactly one `retirement` row. `retire --confirm` refuses on each of the two conditions, lists no realm in the `customer` mode, and completes on a rerun after a partial failure. Erasure produces the column changes of R-35, leaves the person's `audit_event` rows in place under the same id, deletes their account and session rows, and makes no realm call in the `customer` mode. Every command run leaves one `audit_event` row with `action` `ops:<command>` (`DEC-45`).

End-to-end tests (Playwright, at a phone viewport and a desktop viewport, `DEC-25`). After erasure, People shows the anonymized name to an administrator. A later sign-in by the same person is refused under `invite` and creates a new person under `jit` with a mapped group, in both realm modes. This is the one screen path Section 5 changes.

Manual checks, which are the bulk of this section because its deliverables are documents.

1. Reviewer reading. Each runbook is read against the criteria it is named in, above. A step that cannot be typed is a defect (R-2). A step that requires a panel is a defect (R-3). A realm step with no statement per realm mode is a defect (R-4a).
2. Rehearsal on the staging stack, as R-41 defines it, for the new-customer runbook, both delivery paths, the upgrade path including a lagging stack and a failed migration, and the retirement path.
3. The quarterly restore drill of R-21, recorded with its elapsed time.
4. Inventory check: every stack that exists appears in the inventory with its realm mode and its current version (R-30).
5. The go-live checklist and the hardening checklist on the first deployment (R-28a, R-46).

Evidence that outlives the section: each rehearsal and each restore drill leaves a dated record with the release it ran against, the elapsed time, and the findings. The records live beside the runbooks, so that the next quarter's drill compares against the last one. A runbook whose last rehearsal is far behind the current release is then visible without reading it (R-4).

The section is not done while any rehearsal finding is unfixed.

## Deferred

- The automation tool for setup and upgrade. `OPEN-7`, default until decided is the manual path in `../runbooks/deployment.md`. Reopens when the platform is ready for its first deployment. Guard: `DEC-38`, which requires the automation to run the same script, compose file, and commands with no step of its own.
- Upgrades with no downtime. Reopens when a customer contract requires the application to stay available during an upgrade. Guard: expand-then-contract and the three-release rule (`DEC-9`, `DEC-43`), which a rolling upgrade needs.
- Everything in the tracked list of R-40, each with its own trigger and guard.
- A `release` table and a migrator that refuses an image too far ahead. Reopens the first time a customer-hosted deployment is found more than three releases behind (`DEC-43`). Guard: the deployment inventory of R-30, which is what makes that discovery possible.
- `genie-ops files migrate`, which copies blobs between storage adapters. Reopens when a deployment must change its adapter after go-live (`DEC-20`). Guard: every byte goes through `FileStorage` keyed by the `file` id, and the `file` row never records where its bytes live.
- A shorter backup interval or a different deletion hold. Reopens when a customer contract names recovery targets (`DEC-31`) or a different hold (`DEC-17`). Guard: both values live in the runbook and the customer's record, not in code.
- A named operator identity in the audit row. Reopens when a customer contract asks for it (`DEC-45`). Guard: one helper writes every operator row, so the field is added in one place.

Assumptions

- The per-customer read credential is a machine account holding the `read` role on that one package, authenticating with a classic personal access token limited to `read:packages`. Verified on 2026-09-18 against GitHub's documentation on package access control and on token limitations: a package must first be detached from its repository-inherited permissions before per-package roles can be granted, and fine-grained personal access tokens do not work with Packages. Consequence if wrong: the delivery path in R-10 falls back to the `docker save` release file, which `DEC-33` already names as the fallback.
- GitHub charges nothing for container storage and bandwidth and promises advance notice before that changes. Verified on 2026-09-18, consistent with the statement dated 2026-09-17 in `DEC-33`. Consequence if wrong: `DEC-33` already names the release file as the fallback, and R-10 already documents it.
- Backups of Postgres are logical dumps taken with `pg_dump` in its custom format and restored with `pg_restore`, which is what "logical backup" means in `DEC-31`. Consequence if wrong: the drill in R-21 is unchanged, because it measures a restore, not a tool.
- `kc.sh export --realm <realm> --users realm_file` writes one realm with its users to one file, Keycloak recommends that all nodes are stopped during the export, and it recommends a delete through the Admin API before an import over an existing realm. Read on 2026-10-20 in the Keycloak "Importing and exporting realms" guide. Consequence if wrong: the procedure of R-20 changes, and the drill of AC-3 finds it.
- Object versioning with 30 days of noncurrent versions lets a restore take every object as it was at a given time. Consequence if wrong: the bucket gets a nightly copy taken after the database dump, and R-18 item 3 changes.
- `docker save` writes a loadable archive that preserves the image tag, and `docker load` restores it on a host with no registry access. Consequence if wrong: the release file path fails and only the registry path remains.
- The release-tag pipeline is a matrix job over the customer folders, triggered by a tag pattern on push. Verified on 2026-09-18 that tag-filtered `push` triggers and matrix jobs are current GitHub Actions syntax. Consequence if wrong: the job shape changes and R-23 does not.
- The five minute alert threshold in R-15 is a routine operational default with no source. Consequence if wrong: one number changes in one runbook.
- The demo customer of `DEC-18` and the first deployment are Genie's own, so naming their stacks and sso.001.gs breaks no writing rule.

Open questions

None for the owner. The design gates of R-32a are settled in the Section 5 technical plan, and the procedure of R-20 is settled by the drill of AC-3.

Resolved earlier and no longer open: the health endpoint path, the section that owns `genie-ops retire` and its parts, the section that owns the image push, and the local-accounts backup rule. Decided by the product owner on 2026-09-18 and recorded in `DEC-14` and `DEC-17`: erasure is `genie-ops erase <email>`, the row is anonymized and never deleted, and the realm account is deleted (former Q-2 and Q-4). Decided the same day and recorded in `DEC-35` and the repository layout: the per-customer record is `customers/<slug>/runbook.md` (former Q-1). Decided the same day and recorded in `DEC-31`: logs stay on the host under the rotated `json-file` driver (former Q-3). The removal policy is settled. Its durable state, the handling of work and dependencies, the revocation evidence, and the review and concurrency mechanisms stay design gates in the linked policy. Controlled removal stays unavailable until those gates and the lifecycle tests are satisfied.

## Review findings and answers

Findings of the review of 2026-10-20 (verdict: rework before approval):

| Finding | Answer |
| --- | --- |
| 1. The promise that the previous version keeps serving is false for a stack with one application container. | Owner decision: a planned maintenance window. R-16, R-24, R-26, AC-4. `DEC-9` and `DEC-33` amended 2026-10-20, and the upgrade step of `deployment.md` corrected. |
| 2. `genie_studio_url` is missing, and the step claims no new configuration field. | R-5 step 2 and R-27: first setup, later change, the `customer` mode, and a real sign-in and sign-out in both products. Beads `w5a4` linked. AC-5. |
| 3. Client-only mode is not carried through every realm operation. | Terms, R-4a, and every realm step keyed on the recorded realm mode: R-6, R-7, R-18, R-32a, R-34, R-36. Negative tests in AC-7 and in Verification. |
| 4. Helm values are kept as a guard, and AC-8 forbids the linked tickets that exist. | R-26a and the Kubernetes row of R-40 no longer rely on Helm (Beads `2xfl`). R-40 and AC-8 allow a linked deferred Beads item. |
| 5. No recoverable backup set and no drill that proves disaster recovery. | Owner decision: the Keycloak database is backed up and restored with the application database. R-18 backup set, R-20 shared server, R-21 drill on new hosts, R-21a, R-21b. `DEC-31` amended 2026-10-20. Both runbooks corrected. AC-3. |
| 6. The destructive retirement command has no execution contract. | R-32a design gates: ownership, review, one-run credentials, order and partial failure, outcome, and the last backup. Owner decision on the backup period in R-31, `DEC-17` amended 2026-10-20. AC-7. |
| 7. The first-user smoke test checks only an administrator. | R-7c go-live checklist with a pre-mapped group, an admitted member, a refused person, and an empty and a missing claim, per realm mode. AC-1. |
| 8. The upgrade ignores the module and permission lifecycle. | R-24b release notes and checks for new modules, explicit enablement, transformations, and revocations. R-26b links Beads `6nm` and `3pu` as gates. AC-4. |
| 9. The later-capability list misses `OPEN-10`, `OPEN-11`, `OPEN-12`, and the `DEC-29` amendment. | Three rows added to R-40 with no-shipping guards, Beads `r0q6` linked. R-40a and the scope paragraph for principle 9. AC-8. |
| 10. Erasure promises a refused sign-in, but `jit` creates a new user. | Owner decision: erasure removes data only. R-36a states the next sign-in under `invite` and `jit`, and the erase text names the identity provider's job. `DEC-17` amended 2026-10-20. AC-7 and the end-to-end test. |
| 11. Timing rules disagree, and the confidence score is stale. | R-8a, one timing rule used by AC-9 and AC-10. R-28a and R-46 make Beads `d8l5.24` a dependency. New dated confidence paragraph. |

Kept as the review found them sound: the split between the image push and the delivery to a customer (R-13), the worker heartbeat (R-16), the manual automation seam (R-2, R-3), and R-26b, R-26c, and AC-11 on removal and reintroduction.

Dated notes of 2026-10-20 that point to the `DEC-33` amendment now follow each old statement that the previous version keeps serving after a failed migration: `../adr/0005-tenant-migrations-at-deploy.md` (status line), `../adr/0007-one-deployment-per-customer.md`, `../core/roadmap.md` (Section 0 item 5), Spec 0 R-27 and R-36a, and Spec 1 R-12. The original text stays as history.

Not changed here: the Helm wording in `DEC-33`, `../core/vision.md`, `../core/tech-stack.md`, `../core/roadmap.md`, and `../architecture/repository-layout.md` changes with Beads `2xfl`.
