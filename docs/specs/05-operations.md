Confidence: 8.4/10
Reasoning: The sources for hosting modes, delivery, upgrade, backups, and retirement are complete and agree with each other, and every requirement below traces to a decision, a roadmap item, or a recorded cross-section call. The drafting round resolved the health endpoint path, the split of `genie-ops retire` between Sections 1 and 5, and the split of the image push between Sections 0 and 5, and the decisions of 2026-09-18 settled personal erasure, the customer record location, and the log destination, so no work item rests on an open question. The reverse proxy runbook and the realm runbook now exist but have not run against a customer host. Most deliverables are documents, so the real risk is a runbook that reads correctly and fails on a real host, which only the rehearsals in AC-9 and AC-10 catch. `OPEN-7` is an intentional deferral and does not lower the score, because `DEC-38` fixes the manual path as the reference.
Status: Draft — awaiting user approval

## Goal and scope

Section 5 makes a deployment operable. It delivers the operator documents, the delivery and upgrade paths, the backup and restore regime, and the small amount of code that offboarding needs. Its goal is that a new Genie-hosted customer reaches a running deployment in one working day and a customer-hosted one in one week (`../core/roadmap.md`, Section 5, goal).

In scope: the new-customer runbook, the three hosting runbooks with their delivery paths and the per-customer checklist, health checks and log shipping and backups with the recovery targets and the quarterly restore drill, the upgrade path, the cross-product step for genie-studio, the three environments, offboarding, and the tracked list of later capabilities.

Out of scope and owned elsewhere:

- The commands themselves. `genie-ops setup`, `idp set`, `admin add`, `module enable|disable`, `break-glass rotate`, and `migrate` are built in Sections 1 and 2 (`../specs/README.md`, "Section boundaries", row `genie-ops`). Section 5 documents them and proves them on a real host.
- The realm template and the identity provider procedure. The realm runbook is `../runbooks/keycloak-realm.md`, written beside this specification.
- The automation tool for setup and upgrade. `OPEN-7` defers it. This specification specifies no panel-specific step and chooses no tool.
- Logging, error responses, and security headers, which are Section 0 (`DEC-31`).

Boundary with the sections before it: Section 5 runs beside the others from Section 1 onward (`../core/roadmap.md`, "Order and parallelism"). Every runbook it writes depends on a command that Section 1 or Section 2 has already shipped, so a runbook is written only after the command it documents passes its own section's definition of done.

Boundary with what comes after: nothing in the core roadmap follows Section 5. Item 8 is a tracked list, not committed work.

## Sources

- `../core/roadmap.md`, Section 5, items 1 to 8 and the goal. Section 0 items 5 and 8 (the build script and the release-tag pipeline), Section 1 items 1, 4, 5, 6, 10 and 11, Section 2 items 9 and 9a, and "Order and parallelism".
- `../core/vision.md`: "Who it serves" (the Genie operator), "Features / Deployment (operators only)", the Decided table, and `OPEN-7`.
- `../core/decision-log.md`: `DEC-14`, `DEC-15`, `DEC-16`, `DEC-17`, `DEC-18`, `DEC-19`, `DEC-20`, `DEC-21`, `DEC-23`, `DEC-24`, `DEC-31`, `DEC-32`, `DEC-33`, `DEC-35`, `DEC-36`, `DEC-37`, `DEC-38`, `DEC-43`, `DEC-45`. `DEC-8` and `DEC-9` from the Decided table of `../core/vision.md`.
- `../adr/0007-one-deployment-per-customer.md` and `../adr/0002-keycloak-realm-per-tenant.md`.
- `../specs/README.md`, "Cross-section calls made in the drafting round", for the health endpoint, the `genie-ops retire` split, and the image push split.
- `../runbooks/README.md` and `../runbooks/deployment.md`, which is the reference path (`DEC-38`). `../runbooks/keycloak-realm.md`, the realm and identity provider procedure written in the same round and not yet executed against a real server.
- `../architecture/environment-contract.md`, `../architecture/repository-layout.md` (`customers/<slug>/`, `deploy/`, `scripts/`), `../architecture/data-shape.md` (`retirement`, `audit_event`, and the `user` erasure sentence), `../core/tech-stack.md` ("Delivery").

## Requirements

### The runbook set and the automation seam

R-1. Section 5 delivers one runbook per procedure, all under `../runbooks/`, all naming no customer: the new-customer runbook, one runbook per hosting mode, the upgrade runbook, the backup and restore runbook, and the retirement runbook. `../runbooks/deployment.md` stays the single reference that the others link to for the steps they share, and no runbook repeats a step that `deployment.md` already holds (`../runbooks/README.md`).

R-2. No runbook step may depend on a deployment panel. Every step is a command that a person can type: `nx g @genie/generators:tenant-new`, `scripts/build-customer-image.sh`, `docker compose`, and `genie-ops` (`DEC-38`, `../runbooks/deployment.md`, "The shape of one deployment"). A runbook may name a panel only as one way to reach a host, and only where the same paragraph gives the equivalent command.

R-3. The automation seam stays open and unfilled. Whatever tool `OPEN-7` later chooses runs the same build script, the same compose file, and the same `genie-ops` commands with no step of its own, so a runbook written now stays complete (`DEC-38`). No requirement here names or assumes a tool.

R-4. Every runbook carries a status date and the release it was last rehearsed against, so a reader can tell whether it has drifted.

### Item 1: the new-customer runbook

R-5. The new-customer runbook covers the path from the filled checklist to the first administrator's sign-in, in this order (`../core/roadmap.md`, Section 5, item 1, and `../runbooks/deployment.md`, "Set up a new customer"): `nx g @genie/generators:tenant-new <slug>`, fill `tenant.yaml` and `branding.seed.json`, run `scripts/build-customer-image.sh <slug> <version>`, deliver and run the stack, run `genie-ops setup` with the bootstrap credential in the environment of that one command (`DEC-37`), set the identity provider with `genie-ops idp set` unless `local_accounts` is on (`DEC-36`), smoke test, and hand branding to the tenant administrator.

R-6. The runbook states which of its steps the customer must do and which Genie must do, per hosting mode, because in a customer-hosted mode the customer's platform team types the Keycloak server administrator credential and Genie never holds it (`DEC-37`).

R-7. The runbook names the smoke test explicitly: the not-set-up page is gone, the health endpoint reports `ok`, the break-glass account signs in at `PUBLIC_URL/admin/login` and completes the forced password change and authenticator enrollment (`DEC-24`), one first administrator signs in through the identity provider and lands in the workspace with the admin switch visible (`DEC-23`), and an excluded module has no route (`DEC-33`).

R-7a. The runbook states the failure path for setup. Setup is resumable through `setup_step`, so a failed step is fixed and the same command is run again, and a rerun after the realm step does not need the bootstrap credential (`DEC-37`, `../architecture/data-shape.md`, "Deployment tables"). The runbook forbids any manual repair of a half-finished realm.

R-7b. The runbook covers the customer who already runs a Keycloak server: `KEYCLOAK_URL` points at that server and setup creates a fresh Genie realm on it. Reuse of an existing realm with its own users and clients is not supported, and the runbook states that plainly so an operator does not attempt it (`DEC-36`).

R-8. The runbook ends by requiring that the operator record the deployment facts in the per-customer record of R-11 and in the deployment inventory of R-30.

### Item 2: the three hosting runbooks, delivery, and the checklist

R-9. One runbook per hosting mode, each stating only what differs: who runs the host, who upgrades, who holds the break-glass password, who backs up, and whether Genie reaches the host (`DEC-33`, `../runbooks/deployment.md`, "Choose the hosting mode"). The three modes are Genie-hosted, customer-hosted and Genie-managed, and customer-hosted and customer-managed. The hosting mode changes no code, no command, and no configuration file, and each runbook says so.

R-10. Two delivery paths, both documented in every hosting runbook (`DEC-33`):

1. Registry. One private image per customer at `ghcr.io/<org>/genie-<slug>:<version>`. The customer receives credentials that can read that one image and nothing else.
2. Release file. For a site with no internet access, `docker save` produces a file that is attached to a private release, and the site loads it with `docker load`. The runbook records the image digest beside the file so the receiving site verifies what it loaded.

R-11. The per-customer checklist is recorded in that customer's runbook record and never in `tenant.yaml`, because no code reads it (`DEC-35`). It holds: hosting mode, target host, Postgres, SMTP, Keycloak own or supplied, object storage if any, and the delivery path of R-10. The record is `customers/<slug>/runbook.md`, created from a customer-free template under `../runbooks/`, because a customer slug is allowed in `customers/` and not under `docs/` (`DEC-35` as amended 2026-09-18; `../architecture/repository-layout.md`).

R-12. Section 5 delivers a checklist template that names no customer. The template is the only copy in `docs/`.

R-13. The release pipeline completes the delivery path. Section 0 item 8 builds one image per customer folder on a release tag and pushes it, and Section 5 owns the per-customer read token, package access, the release file, and the runbooks (`../specs/README.md`, "Cross-section calls", row "Image push on release tag"). Section 5 adds what makes an image reachable by a customer: the per-customer read credential is granted on that one package, the package is detached from repository-inherited permissions first, and a release file is produced and attached for every customer whose delivery path is the file (`DEC-33`). The pipeline calls `scripts/build-customer-image.sh` and adds no build logic of its own.

R-14. A customer's read credential is revoked as part of retirement (R-26) and is rotated on the customer's request. The runbook names both.

### Item 3: health checks, log shipping, and backups

R-15. Every Genie-operated stack is polled on `GET /api/health`, which is unauthenticated and returns only `ok` or `degraded` and never error text (`../specs/README.md`, "Cross-section calls", row "Health endpoint", and `../core/roadmap.md`, Section 1, item 4). An alert fires when a stack reports `degraded` or fails to answer for more than five minutes.

R-15a. Genie has no access to a customer-managed stack, so its runbook states what the customer must watch and why: the health endpoint, the container restart count, the disk the database sits on, and the backup job. It also states what the customer must send Genie when they ask for support, which is the container log around the failure and the image version, and that the log carries no secret by design (`DEC-31`, `DEC-33`).

R-16. The stack template's application and worker services carry a container health check on the same path, so a failed migration keeps the container unhealthy and the previous version serving (`DEC-9`).

R-17. Logs stay on the host. The stack template sets the `json-file` log driver on every service with rotation at 50 MB per file and 20 files per container, and the hosting runbooks say who reads them and how, with `docker compose logs` or the host's tools. No log aggregation service exists in any hosting mode. Logs are pino JSON with request, tenant, and user ids and carry no secret, no session token, and no emailed link (`DEC-31` as amended 2026-09-18, `../core/roadmap.md`, Section 0, item 10).

R-18. Every Genie-hosted database gets a nightly logical backup kept 30 days (`DEC-31`, `../core/roadmap.md`, Section 5, item 3). The backup is written outside the database host, is encrypted at rest, and its restore is proved by R-21, not by the job reporting success.

R-19. A customer-managed deployment backs up its own database. The backup runbook states what to back up and why: the database, and `.env`, because the image is rebuilt from the repository and a brokered realm is recreated by `genie-ops setup` from the template plus `realm.overrides.json` (`../runbooks/deployment.md`, "Backups"). A realm export taken after setup shortens a restore and is recommended, not required.

R-20. A deployment with `local_accounts` on backs up the Keycloak database as well, because that realm holds the people's passwords and second factors and the template cannot recreate them (`../runbooks/deployment.md`, "Backups", `DEC-10`, ADR 0002). The per-customer record names which of the two cases applies.

R-21. The restore drill runs every quarter on the staging stack of the demo customer (`DEC-31`, `DEC-18`). The drill restores the most recent backup into a fresh database, brings a stack of the same image version up against it, and proves that a person signs in, that the audit rows survived, and that a file downloads. The drill records the elapsed time and compares it with the recovery time target. A drill that is not recorded did not happen.

R-22. Default targets until a customer contract states others: recovery point 24 hours and recovery time 8 hours (`DEC-31`). The backup runbook states that a nightly backup meets the 24 hour recovery point only at its worst case, so a customer that needs better gets a shorter interval written into their record.

### Item 4: the upgrade path

R-23. A release tag builds every customer image, one build per customer folder with that customer's include list (`../core/roadmap.md`, Section 0, item 8, and `DEC-33`). A build that fails for one customer does not block the others, and the release is not announced until every customer build has passed typecheck and the smoke test.

R-24. Upgrading one stack is three steps and is the same in every hosting mode: change `IMAGE_TAG` in `.env`, pull, and bring the stack up (`../architecture/environment-contract.md`, "Read by Docker Compose, not the image", and `../runbooks/deployment.md`, "Upgrade"). A Genie-operated stack may be upgraded through a panel that performs those same steps. A customer-managed stack pulls the next tag itself.

R-24a. An upgrade has a fourth step when the release notes name a new `genie-ops setup` step: run `genie-ops setup` again. Until that run completes, the application shows the not-set-up page, because setup is complete only when every step the running image knows is done (`../runbooks/deployment.md`, "Upgrade", step 5). The upgrade runbook requires reading the release notes for that line before the pull.

R-25. Every release upgrades from the last three releases (`DEC-9`, `DEC-43`). The lagging-stack rule: a stack more than three releases behind upgrades through the intermediate releases one at a time, in order, and the release notes name the oldest release that each version upgrades from. The runbook requires reading the pending-migration count that the migrator logs at start after upgrading a stack that was behind (`DEC-43`).

R-26. A failed migration leaves the container unhealthy and the previous version serving. The upgrade runbook's recovery step is to read the container log, fix the cause, and repeat the pull and the restart. Rolling an image back is not a recovery step, because a contract migration that has run is not reversed by an older image (`DEC-9`, `DEC-43`).

R-26a. The rollout path for many stacks is tracked, not built. Kubernetes with one namespace per customer and a rollout tool is the named path when the count of stacks makes upgrading by hand the bottleneck, at around a hundred customers (ADR 0007, `../runbooks/deployment.md`, "What the count of customers changes"). Section 5 writes no Kubernetes procedure. The entry lives in the tracked list of R-40, and the guard is the `values.yaml` that the tenant generator already writes for every customer.

R-26b. Adopt [Module removal and reintroduction](../architecture/module-removal.md), business flows CF-MA-10–12. Until controlled removal and its tests exist, reject upgrades dropping an installed module; fresh-image exclusions remain supported. Controlled removal requires disablement, accounted-for active/queued work and dependencies, stopped schedules, revoked module-specific inbound credentials and durable completion evidence before deploying without code. Retain tenant data, applied migration history, configuration, roles, assignments and audit. Fail incomplete prerequisites actionably; no implicit purge, cancellation or activation.

R-26c. Reintroduction uses the same stable identity and compatible retained history, supported forward migrations, disabled state, administrator review of retained grants and explicit enablement. Revoked credentials require separate reissue; work never silently resumes. Permanent module-data deletion is a separate explicitly authorized operator procedure specifying exact data/files, retention, exports/backups, references, retained audit and recoverability. This specification authorizes no deletion command and borrows no tenant-retirement timer.

### Item 5: the cross-product step

R-27. For a customer that runs both products, the new-customer runbook carries one extra step: configure that customer's genie-studio deployment with the tenant realm issuer and the `genie-studio` client credentials that the realm template created (`DEC-8`, `../core/roadmap.md`, Section 2, item 9). The step changes nothing in Genie Ops Center and adds no field to any configuration file. The realm side of it belongs to `../runbooks/keycloak-realm.md`.

### Item 6: environments

R-28. Genie runs a demo customer as three Genie-hosted stacks, dev, staging, and production, each with its own database and realm, set up by the same commands with no special mode in code (`DEC-18`). The staging stack is the target of the restore drill (R-21) and of every rehearsal (R-31).

R-29. A customer's UAT is a second stack of that customer, with its own database and realm, on Genie's staging servers or on the customer's own (`DEC-18`). It gets its own row in the deployment inventory and its own entry in the customer's record.

R-30. Genie keeps one deployment inventory that lists every stack, its customer slug, its hosting mode, its environment, and its current image version. `DEC-43` leans on this inventory to make a lagging stack visible, which is why no `release` table exists. Every setup and every upgrade updates it.

### Item 7: offboarding

R-31. Section 1 item 10 ships `genie-ops retire`, the `retirement` row, and the refusal rules, and Section 5 ships `--confirm` deletion after the hold, the deletion hold, and personal erasure (`../specs/README.md`, "Cross-section calls", row "`genie-ops retire`"). `genie-ops retire` records the retirement in the single `retirement` row with `retired_at` and leaves `deletion_hold` false (`../architecture/data-shape.md`, "Deployment tables", and `DEC-17`). The operator then stops the stack. The database, the realm, the bucket, and the last backup are kept for 90 days.

R-32. `genie-ops retire --confirm` deletes the database, the realm, and the bucket. It refuses before 90 days have passed since `retired_at`, and it refuses while `deletion_hold` is set, with a message that names which of the two refused it. Nothing runs on a schedule, so the deletion is always an operator action (`DEC-17`, `../architecture/data-shape.md`).

R-33. The deletion hold is set and cleared by an operator and is visible in the retirement row. A legal hold, a dispute, or an unfinished data export are the reasons the runbook names.

R-34. A customer-managed deployment retires itself. Genie deletes only what Genie holds: the image on the registry, the read credential of R-14, and the realm if it lives on Genie's Keycloak server (`DEC-17`, ADR 0007).

R-35. Personal erasure anonymizes one person and keeps the audit trail. It sets `user.erased_at`, replaces `name` with `Erased person`, replaces `email` with `erased-<id>@invalid`, clears `image`, sets `banned`, and deletes that person's account and session rows. Every other column, the id, and the audit events that name the id stay (`../architecture/data-shape.md`, `user`, and `DEC-17`).

R-36. Erasure also deletes the person's user record in the Keycloak realm through the `genie-admin` client, on every deployment: a local-accounts realm holds their name, email, password, and second factor, and a brokered realm holds a local user record with the imported name and email and the federated identity link, so an anonymized application row alone does not erase them (`DEC-17` as amended 2026-09-18, `DEC-10`, ADR 0006). The realm delete runs first, so an unreachable realm fails the command before the application row changes. The person's account at the customer's identity provider is never touched. A realm that has no record for the email, because the person never signed in, is not an error.

R-37. Erasure runs only on a written request that names the person, and the runbook requires recording the request and the date in the customer's record, by the same rule that governs administrator recovery (`DEC-23`). Erasure is irreversible and the runbook says so before the command.

R-38. Every `genie-ops` command in this section writes one `audit_event` row through the command runner's helper: `actor_user_id` null, `action` `ops:<command>`, and the operating-system user, the non-secret arguments, and the outcome in `metadata` (`DEC-45`). The final delete of `retire --confirm` cannot write a row, because it removes the database that holds the table, so it logs its outcome to the command output and the operator pastes that output into the customer's record. `DEC-45` already names this exception.

R-39. The interface of erasure is `genie-ops erase <email>`, run on the customer's written request, and no screen erases a person (`DEC-14` as amended 2026-09-18). The command writes one `audit_event` row like every other command (`DEC-45`), refuses an email that matches no `user` row or a row already erased, and refuses the break-glass account.

### Item 8: later capabilities, tracked and not scheduled

R-40. Section 5 keeps one tracked list of later capabilities. Each entry carries the trigger that reopens it and the guard that keeps the path open. Nothing on the list is scheduled, estimated, or started by this section, and an entry moves off the list only through its own decision.

| Capability | Trigger that reopens it | Guard that keeps the path open |
| --- | --- | --- |
| SCIM provisioning | A customer requires push-based joiners and leavers (`../core/vision.md`, "Non-goals") | Groups arrive through one normalized claim and one sync function in core (`DEC-41`) |
| Keycloak page and email branding per realm | A customer names it (`DEC-32`), and `DEC-40` holds the current answer | The realm display name is set at provisioning from `branding.seed.json`, and no branding value is written to the realm (`DEC-40`) |
| Audit CSV export and SIEM push | A customer names a retention period shorter than lifetime or a specific SIEM (`DEC-16`) | `audit_event` is append-only and read behind `core:audit:read` (`DEC-16`) |
| ClamAV upload scanning | A customer requires malware scanning (`DEC-20`) | `file.scan_status` exists from the first migration and a scanner flips it with no migration (`DEC-20`) |
| In-app inbox screen | The first module needs the inbox (`DEC-21`) | The `notification` table is written from Section 2 by the same events that send email (`DEC-21`) |
| Support impersonation with consent | Support load demands it (`DEC-15`) | `session.impersonated_by` exists, and a later feature must record the tenant administrator's consent in audit (`DEC-15`) |
| Operator console | The number of deployments makes the command line error-prone, or a non-engineer must operate it (`DEC-14`) | Every operator action is a `genie-ops` command that writes an audit row (`DEC-45`) |
| Kubernetes rollout for many stacks | The count of stacks makes the current host slow, at around a hundred customers (ADR 0007, `../runbooks/deployment.md`) | `values.yaml` is generated into `customers/<slug>/deploy/` for every customer (`../architecture/repository-layout.md`) |

### Rehearsal

R-41. A runbook is not done when it reads correctly. It is done when a person who did not write it follows it start to finish on the staging stack of the demo customer, types no step that the runbook does not contain, and reaches the stated end state. The rehearsal records the elapsed time, every step whose text was wrong or incomplete, and every step the reader had to guess. Each finding is fixed in the runbook before the section closes.

### Cross-cutting operator rules

R-42. Every hosting runbook opens with the host prerequisites and states who supplies each one: Docker with the Compose plugin, a Postgres database and a role that owns it, a mail server or provider account, a public hostname with a certificate at the reverse proxy, and a Keycloak server if the customer runs one (`../runbooks/deployment.md`, "Before you start"). It also states the one proxy rule that a default configuration breaks: a streamed response on a module's chat route must be allowed to stay open for hours with no read or idle timeout.

R-43. The file storage adapter is chosen before go-live and recorded in the customer's record. The runbook states why: the adapter is read from the environment at setup and stays for the life of the deployment, and a later switch needs `genie-ops files migrate`, which is not built (`DEC-20`, `DEC-44`).

R-44. Custody of the break-glass password follows the hosting mode, and each hosting runbook names the holder and the secret store: Genie for a Genie-hosted and for a customer-hosted and Genie-managed stack, the customer for a customer-hosted and customer-managed stack (`DEC-33`). Setup prints the password once, and the runbook forbids writing it anywhere but that store (`DEC-24`).

R-45. The runbook requires `genie-ops break-glass rotate` when the holder of the password leaves or when the authenticator is lost, and records the rotation in the customer's record (`DEC-24`). It repeats the rule that a break-glass session bypasses every permission check and is used only for the scenarios that name it (`DEC-15`).

R-46. Each hosting runbook points at the Keycloak hardening checklist that Section 2 item 10 delivers, and at `../runbooks/keycloak-realm.md` for the realm and identity provider procedure. Section 5 adds nothing to either and only names when an operator must run them: hardening before a stack carries production data, and the realm runbook at setup and at every identity provider change.

## Acceptance criteria

AC-1 (item 1). A rehearsal of the new-customer runbook on the staging stack reaches a signed-in first administrator with no step outside the runbook, and the smoke test of R-7 passes in full. A deliberately failed setup step is recovered by rerunning the same command with no manual repair. Proves R-5, R-6, R-7, R-7a, R-7b, R-8, R-41.

AC-2 (item 2). A reviewer opens each of the three hosting runbooks and finds, in each, the five ownership answers of R-9, both delivery paths of R-10, and the checklist template of R-12. A rehearsal delivers one image by the registry path and one by the `docker save` path, and a host with no access to the registry runs the release file. A reviewer finds the host prerequisites of R-42, the adapter rule of R-43, and the break-glass custody line of R-44 in each of the three. Proves R-9 to R-14 and R-42 to R-45.

AC-3 (item 3). A quarterly drill on the staging stack restores the previous night's backup into a fresh database, a person signs in against it, audit rows and a file survive, and the recorded elapsed time is compared with the 8 hour recovery time target. A `degraded` health response on a monitored stack raises an alert within five minutes. A reviewer finds the local-accounts Keycloak backup line of R-20 in the backup runbook. The customer-managed runbook names what the customer must watch. Proves R-15, R-15a, R-16 to R-22, and R-46.

AC-4 (item 4). A release tag produces one image per customer folder. A staging stack three releases behind upgrades to the new release in one step, and a stack four releases behind is refused by the runbook rule and upgrades through the intermediate release instead. A forced migration failure leaves the container unhealthy with the previous version still serving. A release that adds a setup step is not complete until `genie-ops setup` is rerun, and the not-set-up page shows until it is. Proves R-23, R-24, R-24a, R-25, R-26, R-26a.

AC-5 (item 5). The new-customer runbook's genie-studio step names the realm issuer and the `genie-studio` client credentials and adds no field to `tenant.yaml`. A reviewer confirms that it links to `../runbooks/keycloak-realm.md` for the realm side. Proves R-27.

AC-6 (item 6). Three stacks of the demo customer exist, dev, staging, and production, each with its own database and realm, each created by the same commands. A second stack of one customer stands as UAT and appears in the inventory. Proves R-28, R-29, R-30.

AC-7 (item 7). On a disposable database, `genie-ops retire` writes the `retirement` row, `genie-ops retire --confirm` is refused before 90 days and refused again with `deletion_hold` set, each refusal naming its reason, and is accepted after both conditions clear. `genie-ops erase <email>` produces exactly the column changes of R-35, keeps that person's audit events under the same id, removes the person's record from the realm on both variants and tolerates a realm with no such record, and refuses an unknown email, an erased row, and the break-glass account. Every command run leaves one `audit_event` row except the final delete, which prints its outcome. Proves R-31 to R-38.

AC-8 (item 8). The tracked list holds all eight capabilities, and every row carries a trigger and a guard that cite a decision. No entry has an owner, an estimate, or a ticket. Proves R-40.

AC-9 (goal, Genie-hosted). A rehearsal on Genie's own infrastructure, starting from a filled checklist and the customer's identity provider details in hand, reaches a signed-in first administrator inside one working day, and the elapsed time is recorded. Proves R-5 to R-8 and R-41 against the first time target.

AC-10 (goal, customer-hosted). A rehearsal against a host that stands in for a customer's infrastructure, including the credential handover of R-6 and the delivery path of R-10, reaches the same end state inside one week of elapsed time, and the recorded time separates Genie's work from the waits on the other party. Proves R-6, R-9, R-10, R-41 against the second time target.

AC-11 (module lifecycle). The [removal-policy matrix](../architecture/module-removal.md) is mandatory proof for R-26b/R-26c and CF-MA-10–12. Before removal support exists, test rejection of installed-module omission against a populated database. Before enabling removal support, rehearse install → grants → records → disable → controlled removal → reintroduce → review → enable, including unresolved work, integration revocation, incompatible history, concurrent attempts and failure/retry at every transition. Assert retained data and unrelated authority, no silent resumption, no credential revival and no implicit purge. Record operator outcomes and UI/CLI parity. These are required tests, not executed evidence.

## Verification

Unit tests (Vitest). The 90 day arithmetic of `retire --confirm` at its boundary, the refusal while `deletion_hold` is set, and the field-by-field result of the erasure transform.

Integration tests (Vitest with Testcontainers, a real Postgres and the real migration histories, never a mock). `genie-ops retire` writes exactly one `retirement` row. `retire --confirm` refuses on each of the two conditions and succeeds when both clear. Erasure produces the column changes of R-35, leaves the person's `audit_event` rows in place under the same id, and deletes their account and session rows. Every command run leaves one `audit_event` row with `action` `ops:<command>` (`DEC-45`).

End-to-end tests (Playwright, at a phone viewport and a desktop viewport, `DEC-25`). After erasure, that person's sign-in is refused and People shows the anonymized name to an administrator. This is the one screen path Section 5 changes.

Manual checks, which are the bulk of this section because its deliverables are documents.

1. Reviewer reading. Each runbook is read against the criteria it is named in, above. A step that cannot be typed is a defect (R-2). A step that requires a panel is a defect (R-3).
2. Rehearsal on the staging stack, as R-41 defines it, for the new-customer runbook, both delivery paths, the upgrade path including a lagging stack, and the retirement path.
3. The quarterly restore drill of R-21, recorded with its elapsed time.
4. Inventory check: every stack that exists appears in the inventory with its current version (R-30).

Evidence that outlives the section: each rehearsal and each restore drill leaves a dated record with the release it ran against, the elapsed time, and the findings. The records live beside the runbooks so that the next quarter's drill compares against the last one, and so that a runbook whose last rehearsal is far behind the current release is visible without reading it (R-4).

The section is not done while any rehearsal finding is unfixed.

## Deferred

- The automation tool for setup and upgrade. `OPEN-7`, default until decided is the manual path in `../runbooks/deployment.md`. Reopens when the platform is ready for its first deployment. Guard: `DEC-38`, which requires the automation to run the same script, compose file, and commands with no step of its own.
- Everything in the tracked list of R-40, each with its own trigger and guard.
- A `release` table and a migrator that refuses an image too far ahead. Reopens the first time a customer-hosted deployment is found more than three releases behind (`DEC-43`). Guard: the deployment inventory of R-30, which is what makes that discovery possible.
- `genie-ops files migrate`, which copies blobs between storage adapters. Reopens when a deployment must change its adapter after go-live (`DEC-20`). Guard: every byte goes through `FileStorage` keyed by the `file` id, and the `file` row never records where its bytes live.
- A shorter backup interval or a different hold period. Reopens when a customer contract names recovery targets (`DEC-31`) or a different hold (`DEC-17`). Guard: both values live in the runbook and the customer's record, not in code.
- A named operator identity in the audit row. Reopens when a customer contract asks for it (`DEC-45`). Guard: one helper writes every operator row, so the field is added in one place.

Assumptions

- The per-customer read credential is a machine account holding the `read` role on that one package, authenticating with a classic personal access token limited to `read:packages`. Verified on 2026-09-18 against GitHub's documentation on package access control and on token limitations: a package must first be detached from its repository-inherited permissions before per-package roles can be granted, and fine-grained personal access tokens do not work with Packages. Consequence if wrong: the delivery path in R-10 falls back to the `docker save` release file, which `DEC-33` already names as the fallback.
- GitHub charges nothing for container storage and bandwidth and promises advance notice before that changes. Verified on 2026-09-18, consistent with the statement dated 2026-09-17 in `DEC-33`. Consequence if wrong: `DEC-33` already names the release file as the fallback, and R-10 already documents it.
- Backups are logical dumps taken with `pg_dump` in its custom format and restored with `pg_restore`, which is what "logical backup" means in `DEC-31`. Consequence if wrong: the drill in R-21 is unchanged, because it measures a restore, not a tool.
- `docker save` writes a loadable archive that preserves the image tag, and `docker load` restores it on a host with no registry access. Consequence if wrong: the release file path fails and only the registry path remains.
- The release-tag pipeline is a matrix job over the customer folders, triggered by a tag pattern on push. Verified on 2026-09-18 that tag-filtered `push` triggers and matrix jobs are current GitHub Actions syntax. Consequence if wrong: the job shape changes and R-23 does not.
- The one-working-day and one-week targets are measured from the point the operator holds a filled checklist to the first administrator's successful sign-in. Waits on the other party, such as the customer registering the callback URL in their identity provider, are recorded separately and excluded, because no runbook controls them. Consequence if wrong: the targets are restated against a different clock and AC-9 and AC-10 are re-measured.
- The five minute alert threshold in R-15 is a routine operational default with no source. Consequence if wrong: one number changes in one runbook.
- `../runbooks/keycloak-realm.md` is written and not yet executed against a real Keycloak server, so the first rehearsal of R-5 is also its first run. Consequence if wrong in any step, that step is a rehearsal finding and is fixed in that runbook, not here.
- The demo customer of `DEC-18` is Genie's own, so naming its stacks breaks no writing rule.

Open questions


Resolved in the drafting round and no longer open: the health endpoint path, the section that owns `genie-ops retire` and its parts, the section that owns the image push, and the local-accounts backup rule. Decided by the product owner on 2026-09-18 and recorded in `DEC-14` and `DEC-17`: erasure is `genie-ops erase <email>`, the row is anonymized and never deleted, and the realm account is deleted on a local-accounts deployment (former Q-2 and Q-4). Decided the same day and recorded in `DEC-35` and the repository layout: the per-customer record is `customers/<slug>/runbook.md` (former Q-1). Decided the same day and recorded in `DEC-31`: logs stay on the host under the rotated `json-file` driver (former Q-3). The removal policy is settled; its durable state, work/dependency handling, revocation evidence and review/concurrency mechanisms remain implementation-design gates in the linked policy. Controlled removal remains unavailable until those gates and lifecycle tests are satisfied.
