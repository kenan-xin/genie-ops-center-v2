Confidence: 8.5/10

Business scenarios: [CF-MA-02–09](../flows/module-access-upgrades.md) explain new privileges, equivalent renames, retirement, independent custom copies, future-record scope, retained grants, and security revocation. R-28/R-29/R-31/R-33a–R-33c and AC-8/AC-25 must preserve those accepted outcomes; see the flow's traceability table.
Reasoning: Every behavior below is traced to a roadmap item, a decision entry, an architecture contract, or a row of the cross-section call table in `README.md`, and the version-sensitive Better Auth and Keycloak claims were checked against current documentation rather than memory. No open question remains: the module admin key, the `groups` claim form, sign-out, archived groups, the People remove action, the cookie settings, and the realm capability column were all settled and recorded on 2026-09-18, and an independent review corrected the mapper per realm variant and made the `clients` setup step a verification. The score stays below nine because no implementation exists, so documentation review is the only evidence, and because the realm runbook this section depends on has not run against a Keycloak yet.
Status: Draft — awaiting user approval

## Goal and scope

Section 2 makes a customer employee able to sign in through the customer's identity provider, be recorded as a person with their directory groups, hold roles through those groups, and reach only what those roles allow. It also makes offboarding in the identity provider effective at the next sign-in, and makes an open session end at the idle timeout or at the 24 hour cap at the latest (`../core/roadmap.md`, Section 2 goal, `DEC-46`).

This section delivers the one Better Auth instance inside the tenant context, onboarding and account linking, the break-glass administrator and its lifecycle, local accounts, sessions and their idle rule, rate limits on the sensitive endpoints, the groups sync, the real `can()` and `scopesFor()`, the People, Groups, and Roles screens, the audit writes and the `notification` table, the Keycloak realm template with its two variants, the identity steps of `genie-ops setup` and the three commands that land with them, Keycloak hardening as an operator deliverable, and the audit reader.

Boundary with Section 1. Section 1 owns the deployment tables, the tenant context readers, the mailer, the job queue, the event bus, the file store, and the `genie-ops` runner with its audit helper (`README.md`, "Section boundaries"). Section 2 adds the `user` table and every identity, group, role, and notification table, and adds the foreign keys that Section 1 left off.

Boundary with Section 0. Section 0 owns the signatures of `can()` and `scopesFor()`, the per-request loader shape (`DEC-48`), and the stub that grants only `placeholder:read`. Section 2 item 6 replaces the stub and changes nothing that calls it.

Boundary with Section 3. Section 3 owns the token layers, the shell, the branding pages, the Tenant Settings page that edits the settings this section reads, and the Modules and Categories pages. Sign-in page branding belongs to Section 3 and is listed under Deferred.

Out of scope: record-scope proof end to end (Section 4 item 2), the inbox screen (`DEC-21`), audit export and SIEM push (`DEC-16`), support impersonation (`DEC-15`), SCIM, and a second identity provider in one realm.

## Sources

- `../core/roadmap.md`, Section 2, work items 1 to 12 and the definition of done. Section 0 items 3, 3a, 4, and 11, and Section 1 items 1, 5, 8, 9a, and 10, for what exists before this section.
- `README.md`, "Section boundaries" and "Cross-section calls made in the drafting round". Seven rows of the call table bind this section: nullable user columns, module admin key, `groups` claim form, sign-out, setup steps across releases, landing route, and the idle-timeout seam.
- `../architecture/access-model.md`: "The one rule", "Sign-in, step by step", "What happens at each sign-in", "How a group becomes permissions", "Local groups", "The first administrator", "Per-person assignments".
- `../architecture/data-shape.md`: "Deployment tables", "Identity (Better Auth, generated)", "Tenant settings", "Groups", "Roles and permissions", "Notifications", "Audit".
- `../architecture/module-contract.md`: "Permission keys", "Record types", "Default roles", "Navigation", "What core provides to a module".
- `../architecture/environment-contract.md`: "Required", "Optional", "Rules".
- `../architecture/repository-layout.md`: `deploy/keycloak/`, `customers/<slug>/deploy/`.
- `../core/vision.md`: "Who it serves", key problem 2, the Decided table.
- `../core/decision-log.md`: `DEC-15`, `DEC-16`, `DEC-21`, `DEC-23`, `DEC-24`, `DEC-31`, `DEC-32`, `DEC-36`, `DEC-37`, `DEC-39`, `DEC-40`, `DEC-41`, `DEC-45`, `DEC-46`, `DEC-48`. `DEC-7`, `DEC-8`, `DEC-10`, and `DEC-11` from the vision table, with their detail in ADR 0002 and ADR 0006.
- `../adr/0002-keycloak-realm-per-tenant.md`, `../adr/0004-authorization-in-application.md`, `../adr/0006-keycloak-and-better-auth-split.md`, `../adr/0007-one-deployment-per-customer.md`.
- `../core/tech-stack.md`: "Identity and access", "Communication", "Quality".
- `../runbooks/deployment.md`: "Set up a new customer", "Add the identity provider", "Recovery by scenario".
- `../runbooks/keycloak-realm.md`: the realm template and identity provider runbook, written beside this specification.
- Design files, which own presentation and are cited, never restated: `../design/sections/sign-in-and-tenant-pages/spec.md` and `types.ts`, `../design/sections/account-and-inbox/spec.md` and `types.ts` (account page and sessions only), `../design/sections/people-groups-and-roles/spec.md` and `types.ts`, `../design/sections/audit-and-tenant-settings/spec.md` (Audit log screen only).

## Requirements

### Migration and tables

R-1. One migration in the core history creates `user`, `session`, `account`, `verification`, `two_factor`, `group`, `group_member`, `role`, `role_assignment`, and `notification`, with the columns, keys, and indexes of `../architecture/data-shape.md` ("Identity (Better Auth, generated)", "Groups", "Roles and permissions", "Notifications"). The same migration adds the foreign key to `user.id` on `tenant_settings.updated_by_user_id`, `tenant_branding.updated_by_user_id`, and `audit_event.actor_user_id`, which Section 1 created nullable for this purpose (`../core/roadmap.md`, Section 1 item 1).

R-2. Rule 7 of `../architecture/data-shape.md` names all six Section 1 columns that reference `user.id`, so the migration adds the foreign key to each of the six: `tenant_settings.updated_by_user_id`, `tenant_branding.updated_by_user_id`, `audit_event.actor_user_id`, `file.uploaded_by_user_id`, `tenant_api_key.created_by`, and `tenant_integration.created_by_user_id` (`README.md`, "Cross-section calls", Nullable user columns). Each stays nullable, so a row written before a person existed survives.

R-3. The migration is expand-only and passes Squawk and `drizzle-kit check` in the pull request pipeline (`DEC-43`).

### The Better Auth instance

R-4. Core builds exactly one Better Auth instance, inside `createTenantContext()`, from the values that context already holds: `PUBLIC_URL` as the base URL, `BETTER_AUTH_SECRET`, `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, and `KEYCLOAK_CLIENT_SECRET` (`../architecture/environment-contract.md`, "Required"). The instance is a member of the tenant context and is never exported as a module-level singleton, so the two-context isolation test of `DEC-34` keeps holding. The instance uses the tenant context's Drizzle pool and opens no connection of its own.

R-4a. Cookie and proxy settings of the instance, decided by the product owner on 2026-09-18 (backlog item `genie-ops-center-v2-0gr`): the session cookie is named `__Host-genie-session` through `advanced.cookies.session_token.name`, `advanced.useSecureCookies` is on, `crossSubDomainCookies` is off, `trustedProxyHeaders` stays off because `PUBLIC_URL` fixes the host (`DEC-19`), and `advanced.ipAddress.trustedProxies` is the parsed value of `AUTH_TRUSTED_PROXIES`, so the session's stored address comes from `X-Forwarded-For` only when the request arrived from the deployment's reverse proxy (`../architecture/environment-contract.md`, "Optional"; `../runbooks/reverse-proxy.md`, step 7). In development, where the base URL is not HTTPS, the prefix and the secure flag are off, because a browser refuses a `__Host-` cookie on plain HTTP.

R-5. The instance registers the `genericOAuth` plugin with one provider whose `providerId` is `keycloak` and whose `discoveryUrl` is `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration`, with PKCE on (`../core/tech-stack.md`, "Identity and access"). The callback path is `/api/auth/callback/keycloak`, which is the core callback route for a generic provider since Better Auth 1.7, and the realm template registers exactly that path as the client redirect URI (R-49a).

R-6. Sign-in is `signIn.social({ provider: "keycloak" })`. No client plugin is used, and no second sign-in path for employees exists in the application (ADR 0006, "Considered options").

R-7. `account.encryptOAuthTokens` is on, so the `access_token`, `refresh_token`, and `id_token` columns rest encrypted with the application secret (`../architecture/data-shape.md`, `account`). The sign-out path of R-17 reads the id token once for `id_token_hint`. Nothing else in Genie Ops Center reads any of the three columns (`../core/roadmap.md`, Section 2 item 1, `README.md`, "Cross-section calls", Sign-out).

R-8. `account.accountLinking.enabled` is on with `trustedProviders` equal to `["keycloak"]` and `allowDifferentEmails` off, so a person who already exists by email links to the realm account on first sign-in rather than gaining a second `user` row (`../core/roadmap.md`, Section 2 item 2).

### Onboarding

R-9. A database hook on user creation reads `tenant_settings.onboarding_mode` through the settings reader of `DEC-46` and applies `DEC-7`. In `invite` mode an email with no `user` row is refused before anything is written, no session is created, and the sign-in page shows the not-registered banner. In `jit` mode an email with no `user` row is created with `status` `active` and `onboarding` `jit`.

R-10. A pre-added person has `status` `pending` and `onboarding` `invited`. Their first sign-in sets `status` to `active` and sets `first_sign_in_at`, and leaves `onboarding` unchanged. Activation happens in both onboarding modes.

R-11. A person whose `banned` column is set is refused after the realm authenticated them, no session is created, and the sign-in page shows the access-disabled banner. A refusal of either kind writes an audit event (R-44).

R-12. `user.email` is taken from the token for a brokered account and is never editable by the person (`DEC-32`, "Email is not self-service"). An administrator changing a local account's email is audited and is out of scope for this round (`../design/sections/people-groups-and-roles/spec.md`, "Out of scope").

### Sessions

R-13. Sessions are database-backed. `session.expiresIn` is a fixed 86400 seconds as the absolute cap. `session.disableSessionRefresh` is on, because Better Auth's `updateAge` refresh extends the absolute expiry and would break the fixed 24 hour cap that `DEC-46` sets. `session.freshAge` is 0, so the sessions list keeps working for a person whose sliding session is older than a day. `session.cookieCache` stays off, so a revoked session is refused on the next request (`DEC-46`, `../core/roadmap.md`, Section 2 item 4).

R-14. The idle timeout is the application's own per-request check. On every authenticated request core reads `session_idle_minutes` through the settings reader and compares it with the session's last activity time. A session past the idle window is deleted and the request is answered as unauthenticated, and the browser lands on the sign-in page with the session-expired banner that names the tenant's idle minutes (`DEC-46`, `../design/sections/sign-in-and-tenant-pages/spec.md`, "User Flows").

R-15. Real browser activity slides the session. The client sends one activity call on pointer, keyboard, or touch input, throttled to half the idle window, and that call is the only writer of the session's last activity time. Ordinary request traffic does not slide a session, so a background poll cannot keep an unattended browser signed in (`../design/sections/account-and-inbox/spec.md`, "User Flows").

R-15a. Section 2 exposes the session's idle expiry time to the client, as an absolute time computed from the last activity and the current idle minutes, and returns the new value from the activity call of R-15. Section 3 schedules the warning from that value, so "Stay signed in" always lands inside the window (`README.md`, "Cross-section calls", Idle-timeout seam).

R-16. `advanced.ipAddress.trustedProxies` is built from `AUTH_TRUSTED_PROXIES` and is validated at start with the other environment values (`../architecture/environment-contract.md`, "Rules"). An empty list means the socket address is used. `session.ip_address` holds the resolved client address and is shown as an address, never as a place (`../architecture/data-shape.md`, `session`).

R-17. Sign-out ends both sessions in order: the Genie Ops Center session row is deleted, then the browser is sent to the realm's `end_session_endpoint` with the account's stored id token as `id_token_hint` and `PUBLIC_URL` as `post_logout_redirect_uri` (`DEC-11`, ADR 0006, "Consequences", `README.md`, "Cross-section calls", Sign-out). This one read is the only read of a stored identity-provider token. When no stored id token is available the request falls back to `client_id` plus `post_logout_redirect_uri`, which Keycloak answers with its own confirmation page.

R-17a. The sign-in page belongs to this section as behavior, and to Section 3 as presentation. Five states exist and each has one cause: the default state, signed out after R-17, session expired after R-14, not registered after the R-9 refusal, and access disabled after the R-11 refusal. Copy never says whether an email exists (`../design/sections/sign-in-and-tenant-pages/spec.md`, "User Flows").

R-17b. Section 1 defines the list of setup steps the running image knows, and Section 2 lengthens that same list with the five identity steps of R-52 (`README.md`, "Cross-section calls", Setup steps across releases). The not-set-up page of Section 1 item 2 shows every step in the list, and every route keeps showing it while any step is not done. After this section the list is seven steps, and the list is also the run order: `migrations`, `seed`, `realm`, `clients`, `roles`, `admin_seed`, `break_glass` (`../architecture/data-shape.md`, `setup_step`, `README.md`, "Cross-section calls", Setup step order).

R-18. The account page is built here: the Profile block, the Sessions block with per-session sign-out and sign out everywhere, and the read-only Roles and access block that lists each role the person holds with its scope and whether it arrives directly or through a group, rendered as `../design/sections/account-and-inbox/spec.md` specifies. The roles summary reads through the loader of R-27 and edits nothing. Section 3 item 7 adds only the Preferences block, which is language, time zone, and theme (`README.md`, "Cross-section calls", Account page roles summary).

### Rate limits

R-19. Three endpoints are limited with a fixed window stored in `rate_limit_window`, keyed on endpoint, subject, and window start, which the next window overwrites, so no sweeper job exists (`DEC-31`, `../architecture/data-shape.md`, "Deployment tables"): add person, resend set-password email, and break-glass sign-in. Sign-in brute force for employees is the realm's job (R-49).

R-20. The subject is the acting person's id for add person, the target person's id for resend set-password, and the constant `deployment` for break-glass sign-in, which is limited per deployment (`../design/sections/sign-in-and-tenant-pages/spec.md`, "User Flows"). The window length and the count are constants in core, not tenant settings.

R-21. Every refusal writes one `audit_event` row with action `auth:rate_limited` and the endpoint, the subject kind, and the window in `metadata`. The break-glass sign-in card shows the neutral notice with the remaining minutes and disables its inputs, and no endpoint reveals whether an email exists.

### Groups

R-22. One function in core, `syncGroupMemberships(userId, claim | undefined)`, is the only writer of `group_member` rows whose source is `idp` (`DEC-41`, Guard). It runs on every sign-in, after the session is created.

R-23. The three cases are exactly those of `DEC-41` and `../architecture/access-model.md` ("What happens at each sign-in"). A present claim with names creates a `group` row with source `idp` for any name not seen before, sets `last_seen_at`, and replaces the person's `idp` memberships. A present and empty claim removes the person's `idp` memberships. An absent claim keeps them, lets the sign-in complete, and writes the audit event `auth:groups_claim_absent` with the user id.

R-24. Local groups are never touched by the sync. A person may hold both kinds at once, and a role is assigned to either kind in the same way (`../architecture/access-model.md`, "Local groups").

R-24a. A directory group whose `last_seen_at` is older than its members' recent sign-ins is shown as stale. Staleness is computed on read from `last_seen_at` and is not a stored flag, so no job keeps it current (`../architecture/data-shape.md`, `group`).

R-25. A directory group is archived, never deleted. A local group is deleted after a confirm step that names its member count and its role assignment count, and the delete removes both (`../architecture/data-shape.md`, `group`, `group_member`).

### The access seam

R-26. `can(user, permission, resource?)` and `scopesFor(user, permission)` replace the Section 0 stub with the real evaluator, keeping the signatures and the loader shape the stub already had (`DEC-48`, `README.md`, "Section boundaries"). No permission check and no scope filter exists anywhere else (`DEC-39`, `../architecture/module-contract.md`, "What a module must not do").

R-27. One lazy loader is built per request in the tRPC context and in the page loader, and one per job run in the worker. The first call reads the person's role assignments once, with their scopes and the permission keys of their roles, for principals equal to the person's user id and each of their group ids. Every later call in the same request answers from that read. The loader is never shared between requests, so a role granted or revoked applies on the next request (`DEC-48`).

R-28. `can()` returns true when any matching assignment carries the permission and its scope is null, matches the resource, or matches one of the parents the owning module's record-type resolver returns for that resource (`DEC-39`, `../architecture/module-contract.md`, "Record types"). The resolver is called at most once per resource per request.

R-29. `scopesFor()` returns `all` when any matching assignment has a null scope, and otherwise the list of scopes as type and id pairs, with parent scopes returned unchanged for the module to map onto its parent columns (`DEC-39`).

R-30. The only bypass is `user.is_break_glass`, and it applies only once that account's session is no longer limited (`DEC-23`, `DEC-24`). While `must_change_password` is true or the authenticator is not enrolled, `can()` refuses everything and every router refuses except the endpoints that clear the two conditions (`../architecture/data-shape.md`, `user`).

R-31. A module with admin pages declares `<id>:admin`, and that is the key core appends to the `Tenant administrator` role when the module's entitlement is enabled and removes when it is disabled (`../architecture/module-contract.md`, "Permission keys", `DEC-23`, `README.md`, "Cross-section calls", Module admin key). The solutions module's `solutions:admin` is the pattern. The placeholder module declares `placeholder:admin`, so the append and the removal both have a contract test.

R-32. A role assignment held through an archived directory group does not grant. The loader of R-27 excludes assignments whose group principal is archived, the rows are kept, restoring the group brings them back, and the Archive confirm names how many assignments stop (`../architecture/data-shape.md`, `group`; `../architecture/access-model.md`, "How a group becomes permissions"; decided by the product owner on 2026-09-18).

R-33. Core seeds its own permission keys exactly as a module does: `core:people:manage`, `core:groups:manage`, `core:roles:manage`, `core:branding:manage`, `core:settings:manage`, and `core:audit:read`. Two system roles are seeded: `Tenant administrator` with all six, and `Auditor` with `core:audit:read`. Both carry `is_system`, so an administrator may copy but not delete them (`../architecture/data-shape.md`, "Roles and permissions").

R-33a. Core and module permission/default-role upgrades must follow `../architecture/permission-evolution.md` (DEC-23 addendum). New definitions and new system roles create no person/group assignments or additional authority for existing roles. System-role metadata changes preserve IDs and assignments. Equivalent permission-key migrations cover affected system and custom roles without changing authority or scopes. Custom copies remain independent. Privilege expansion uses separate permissions/roles with administrator opt-in; security revocations require explicit audited migrations and release-note impact. Startup seeding must not silently overwrite existing permission arrays.

R-33b. Ordinary role-based evaluation in both `can()` and `scopesFor()` must treat retired or unknown permission keys as non-granting even when stored in assigned roles. Valid permissions in the same role continue working. Retired keys are not reused for different capabilities; the role editor identifies unavailable entries and permits removing them from custom roles without deleting the role, its assignments, or group memberships. Broad record scopes cover future records, not new actions or unrelated modules. R-31's Tenant administrator admin append and R-30's break-glass rules remain explicit separate contracts, not a generic wildcard.

R-33c. Permission transformations must be explicit, versioned, reviewed, repeat-safe, and audit-visible, preserving all identities/scopes except the declared permission change. Failure must expose no partially transformed authorization state and must prevent the failed new process becoming ready. The upgrade verification matrix in `../architecture/permission-evolution.md` is mandatory with real migrations and Postgres; the final transaction/coordination mechanism remains the separate reconciliation decision.

### Navigation filtered by permission

R-34. The module registry gains the permission filter that Section 2 item 6 owns, beside the entitlement filter Section 1 added (`README.md`, "Section boundaries"). For each navigation entry an included and entitled module declares, core calls `can()` for that entry's required permission through the same per-request loader, and omits the entry when the call refuses. A module whose entries are all omitted contributes no entry and no heading.

R-35. "Sees the module that role grants" in the definition of done means exactly R-34: the workspace entry of a module is rendered when the person holds that module's `<id>:use` key, which every module with a workspace entry declares and requires (`DEC-50`). A screen the person may not open is hidden from navigation and its route refuses on the server, and the route is not unmounted (`README.md`, "Cross-section calls", Permission-gated route, `DEC-39`). Hiding is never the enforcement, so a person who types the path is refused by `can()` in the procedure with the same answer.

R-36. Core sends a person to the landing route after sign-in only when the entry marked as the landing route survives R-34 (`DEC-49`). When it does not, the shell shows the empty state for a person with no grants, which Section 3 item 4 renders.

### People, Groups, and Roles

R-37. Three core routers, each procedure behind `can()` with `core:people:manage`, `core:groups:manage`, or `core:roles:manage`, back the three admin portal screens. The screens are rendered as `../design/sections/people-groups-and-roles/spec.md` specifies.

R-38. Self-protection is enforced on the server and mirrored in the screens. No person may disable or remove themselves. No write may leave zero active holders of `Tenant administrator`, counting direct assignments and assignments held through a group. One core function performs this check and every writer calls it: disable person, remove person, remove a direct assignment, remove an assignment from a role, delete a local group, remove a group member, remove all members of a group, and archive a directory group (`../architecture/data-shape.md`, "Identity", self-protection, and `../design/sections/people-groups-and-roles/spec.md`, "User Flows"). A refusal returns a stable error code and the screen shows the control disabled with the same reason.

R-39. The break-glass account is excluded from every read of the three screens by `is_break_glass` and appears only in the audit log (`DEC-24`).

R-40. Add person works in both onboarding modes and assigns roles before first sign-in (`../core/roadmap.md`, Section 2 item 2). When `tenant_settings.local_accounts_enabled` is on, add person also creates the account in the tenant realm through the `genie-admin` service client and triggers the realm's set-password action email, and the `user` row is created pending as in invite mode (`DEC-10`, `../core/roadmap.md`, Section 2 item 3a). The realm calls used are the admin REST user creation endpoint and the execute-actions email endpoint carrying `UPDATE_PASSWORD`.

R-41. "Resend set-password email" is offered for a pending local-account person only, calls the same realm endpoint, is rate limited by R-19, and records when it was last sent. There is no manual activation, because first sign-in activates (`../design/sections/people-groups-and-roles/spec.md`, "User Flows").

R-42. Password reset for a local account is a link to the realm's own reset flow, never a form in Genie Ops Center (`DEC-10`, ADR 0006).

R-43. Removing a person deletes their `role_assignment` rows with a user principal, their `group_member` rows, and their `session` rows, and sets `banned`, so a later sign-in is refused. The `user` row, its name and email, and every audit event that names its id stay. Anonymizing the row is personal erasure, which is the `genie-ops erase` command and never a screen action (`../architecture/data-shape.md`, `user`; `DEC-14`, `DEC-17`; decided by the product owner on 2026-09-18).

### Audit and notifications

R-44. Core writes `audit_event` rows for sign-in success, each sign-in refusal, sign-out, `auth:groups_claim_absent`, `auth:rate_limited`, every write on the People, Groups, and Roles screens, and every break-glass action. Each row carries the actor, the action as `module:verb`, the target type and id, a one-line summary, and non-secret metadata. No emailed link and no token is ever written to a row or a log (`DEC-31`, `../core/roadmap.md`, Section 0 item 10).

R-45. The action strings core writes in this section are one catalogue in core, so the audit reader's action filter has a fixed list to group. Sign-in and session actions carry the `auth:` prefix: `auth:sign_in`, `auth:sign_in_refused`, `auth:sign_out`, `auth:groups_claim_absent`, `auth:rate_limited`, `auth:break_glass_sign_in`. Administration actions carry the `core:` prefix and name the object and the verb, for example `core:person_added` and `core:role_assignment_removed`. Operator rows keep the `ops:<command>` form that `DEC-45` fixes.

R-46. The `notification` table is created in the migration of R-1 and is written by the same events that send email (`DEC-21`, `../core/roadmap.md`, Section 2 item 8).

R-47. Three core events are emitted through the Section 1 event bus. `core:session:new` fires on a sign-in from a device not seen before, sends the new-device sign-in email from the Section 1 template catalogue, and writes an in-app notification for the person. `core:role:granted` and `core:role:revoked` fire on an assignment change, send the role email, and write an in-app notification.

R-48. "A device not seen before" is decided without a device table, because none exists and `DEC-32` records that no device trust is built. Core compares the normalized user agent of the new session with the user agents recorded in that person's earlier `auth:sign_in` audit rows, which are append-only and kept for the tenant's lifetime, so the answer does not change when old session rows expire.

### The realm template

R-49. The realm template is a realm export checked into `deploy/keycloak/` in two variants, `realm-template.json` for a brokered tenant and `realm-template.local.json` for a local-accounts tenant, and is applied by `genie-ops setup` (`../architecture/repository-layout.md`, `deploy/keycloak/`, `DEC-10`, `DEC-36`). The exact per-protocol values, the mapper configuration, and the operator steps live in `../runbooks/keycloak-realm.md` and are not restated here.

R-49a. Both variants create the `genie-ops-center` client with PKCE required, the redirect URI `${PUBLIC_URL}/api/auth/callback/keycloak`, and the post-logout redirect URI `${PUBLIC_URL}`, the `genie-studio` client (`DEC-8`), and the `genie-admin` service client. `genie-admin` holds realm-management roles in this realm only, for user management and identity provider configuration (`../architecture/environment-contract.md`, "Required", `../runbooks/keycloak-realm.md`). Both set trust email and both enable brute-force protection. The realm display name is set to the company name at realm creation with the bootstrap credential, so Keycloak's built-in emails print it (`DEC-37`, `DEC-40`). `emailTheme` is present and unset rather than absent, which is the guard `DEC-40` records.

R-50. Each realm variant carries exactly one protocol mapper that emits the claim named `groups`, in the id token and the access token, and which mapper it is depends on where the person's groups live (`../runbooks/keycloak-realm.md`, "The `groups` claim", `../architecture/access-model.md`, "Sign-in, step by step" step 5). A brokered person has no realm group membership, so the brokered variant carries a User Attribute protocol mapper that reads a multivalued user attribute, and `genie-ops idp set` adds the identity provider mapper of kind Attribute Importer that fills that attribute from the provider's claim or attribute (R-58, `DEC-36`). A local account and an LDAP-federated account do hold realm group memberships, so the local-accounts variant and an LDAP federation use the Group Membership mapper with `full.path` false, which emits bare group names and not paths (`README.md`, "Cross-section calls", `groups` claim form). The exact mapper values per protocol are in `../runbooks/keycloak-realm.md`. The brokered variant sets the identity-provider redirector as the default authenticator, so a person is sent straight to the customer's provider. The local variant adds email verification, a password policy, an optional authenticator-app required action, and per-realm SMTP. It adds no identity-provider redirect (`../core/roadmap.md`, Section 2 item 3a).

R-51. Genie Ops Center reads only the `groups` claim, whatever the provider called its own list (`../architecture/access-model.md`, "Where the group list comes from"). Nothing about the provider's protocol reaches application code. `group.external_id` holds the name the provider sent, and `group.name` shows the same value until an administrator renames a local group.

R-51a. A person whose account type is local keeps that account type after `local_accounts_enabled` is turned off, so the Profile block and the resend control must read the account's own provider row and not the current setting (`../design/sections/people-groups-and-roles/spec.md`, "User Flows"). The account type is fixed at creation and is never changed by a settings change.

### Setup and the commands

R-52. `genie-ops setup` gains the identity steps, appended to the resumable command of Section 1 item 5 and recorded in `setup_step`: `realm`, `clients`, `roles`, `admin_seed`, and `break_glass`, in that order and after the Section 1 steps `migrations` and `seed` (`../architecture/data-shape.md`, `setup_step`, `README.md`, "Cross-section calls", Setup step order). Each step is idempotent and checks its own end state, so a stack set up before this release runs the new steps on its next `genie-ops setup` and a rerun after a failure resumes. The `realm` step also writes `tenant_settings.realm_supports_local_accounts` from the template variant it applied, which is the one source of that fact for the Tenant Settings page (`../architecture/data-shape.md`, `tenant_settings`; `DEC-36` as amended 2026-09-18). The identity provider is not a step (`DEC-36`).

R-53. The `realm` step creates the realm from the variant that `tenant.yaml`'s `local_accounts` selects, merged with `customers/<slug>/deploy/realm.overrides.json` (`DEC-36`). The import carries the three clients of R-49a, with the `genie-ops-center` and `genie-admin` secrets taken from `KEYCLOAK_CLIENT_SECRET` and `KEYCLOAK_ADMIN_CLIENT_SECRET` in the environment and the redirect URIs derived from `PUBLIC_URL`, the display name, and the SMTP settings, so everything that needs server or realm administration happens in this one step. It uses `KEYCLOAK_BOOTSTRAP_USER` and `KEYCLOAK_BOOTSTRAP_PASSWORD` from the environment of that one command, uses them for this step only, and never writes them to a file or a log. When they are absent the step refuses with a clear message (`DEC-37`).

R-54. The `clients` step verifies, with the `genie-admin` client, that the three clients exist with the expected redirect URIs and that `genie-admin` itself authenticates, and it refuses with a message that names the missing client when they do not, because `genie-admin` holds no client-management role and cannot create them (`../runbooks/keycloak-realm.md`, "The `genie-admin` service client"). Every later step and the running application use that realm-scoped client (`DEC-37`). A later change of `PUBLIC_URL` is a realm edit that needs the bootstrap credential again, and the deployment guide will say so when that case arises.

R-55. The `roles` step seeds the two core system roles of R-33, seeds the local group `Genie Administrators` holding `Tenant administrator` tenant-wide, and seeds the default roles of every enabled module (`../architecture/access-model.md`, "The first administrator", `../architecture/module-contract.md`, "Default roles"). It runs after the Section 1 `seed` step, which inserts the `tenant_module` rows, so every compiled module's entitlement exists by the time default roles are seeded (`../architecture/data-shape.md`, `setup_step`).

R-56. The `admin_seed` step pre-adds each initial administrator from `tenant.yaml` as a pending person with `onboarding` `invited` and as a local member of `Genie Administrators`. It sends no email, so setup runs without a mailer (`DEC-23`, `../core/roadmap.md`, Section 1 item 8).

R-57. The `break_glass` step creates the account from the operator-supplied email in `tenant.yaml` with `is_break_glass` and `must_change_password` set, creates its `credential` account row with a generated password that meets the shared rule of R-64, and prints the password once to the command output for the operator's secret store. The password is never written to a file, a log, or an audit row (`DEC-24`).

R-58. `genie-ops idp set` lands here with the tables it writes. It takes the protocol, the issuer or metadata URL, the client id, and the client secret as arguments, and it runs through the realm-scoped `genie-admin` client. For OIDC or SAML it writes an identity provider into the realm and sets it as the default redirector. For LDAP or Active Directory it writes a user federation with its own group mapper, and the person then signs in on the realm's own form rather than through a redirect (`../architecture/access-model.md`, "Sign-in, step by step" step 3). For OIDC and SAML it also creates one identity provider mapper of kind Attribute Importer, which copies the named claim or attribute into the user attribute that the brokered variant's `groups` protocol mapper reads (R-50). An LDAP federation needs no importer, because its group mapper gives the person real realm groups. Nothing about the provider is stored in `customers/<slug>/` (`DEC-36`, `../runbooks/deployment.md`, "Add the identity provider", `../runbooks/keycloak-realm.md`).

R-59. `genie-ops admin add <email>` pre-adds the person as pending in `Genie Administrators`, or adds an existing person to that group, sends no email, and is the recommended administrator recovery path (`DEC-23`, `../runbooks/deployment.md`, "Recovery by scenario").

R-60. `genie-ops break-glass rotate` rotates the password, clears the authenticator, sets `must_change_password`, and deletes the account's sessions, in one transaction, and prints the new password once (`DEC-24`).

R-61. Every one of these commands writes one `audit_event` row through the runner's helper from Section 1 item 10: `actor_user_id` null, action `ops:<command>`, and the operating-system user, the non-secret arguments, and the outcome in `metadata` (`DEC-45`). A setup step that runs before the database exists logs to the command output only.

### Break-glass lifecycle

R-62. The break-glass door is `/admin/login`, is not linked from the sign-in page, and uses Better Auth email and password. Only an account with `is_break_glass` may sign in there. Any other credential is refused with a neutral message and no session (`DEC-15`, `../design/sections/sign-in-and-tenant-pages/spec.md`, "User Flows").

R-63. The Better Auth two-factor plugin is enabled and is used by this account only (`DEC-15`, `DEC-32`). The product name is the TOTP issuer. The plugin's `failed_verification_count` and `locked_until` columns are the lockout for the code step, and they are separate from the rate limit of R-19, which counts credential attempts (`../architecture/data-shape.md`, `two_factor`).

R-64. The password rule is shared by the client meter and the server check: at least 14 characters, three of the four character classes, not the provisioning password, and not the account email. The provisioning-password rule is checked on save only (`DEC-24`).

R-65. First sign-in, and any sign-in after a rotation, forces a password change and then authenticator enrollment. Until both are done the session is limited as R-30 states, and every other route answers with the limited-session page. Completing both revokes the account's other sessions (`DEC-24`).

R-66. The account page variant at `/admin/account` offers change password with the current password required, re-enroll authenticator, and sessions, and offers no preferences and no roles summary (`../design/sections/account-and-inbox/spec.md`, "UI Requirements").

### The audit reader

R-67. A filterable Audit log screen in the admin portal sits behind `core:audit:read` (`DEC-16`). It filters on free text over summary and target, actor, action, target type, and a date range, and it loads newest first by keyset on occurrence time and id with a Load more control. No row is editable and no row is deletable.

R-68. One filter selects operator rows, which are the rows with a null actor and an action beginning `ops:` (`DEC-45`). Export and SIEM push are later (`DEC-16`).

R-69. The reader links a target only when the owning module's record-type resolver returns a path and the viewer may open it under `can()` (`../architecture/module-contract.md`, "Record types"). A target that no longer exists is shown without a link.

### Hardening and headers

R-70. Keycloak hardening is an operator deliverable, not application code: replace the temporary bootstrap administrator, run Keycloak against an external backed-up database, run more than one node, and add monitoring. The steps and the checklist live in `../runbooks/keycloak-realm.md` (`../core/roadmap.md`, Section 2 item 10).

R-71. The security headers set once in the app in Section 0 item 11 now cover the sign-in page, `/admin/login`, the limited-session page, and the not-set-up page (`DEC-31`, `README.md`, "Section boundaries").

R-33d. Controlled removal and reintroduction follow [CF-MA-10–11](../flows/module-access-upgrades.md) and the [removal policy](../architecture/module-removal.md). Retain role/assignment identities; unavailable module keys grant nothing while unrelated keys in mixed roles keep working. Expose historical grants without importing absent modules or reading their tables, allow authorized assignment removal while unavailable, and render missing-module status without broken audit links. Explicit reactivation restores only remaining valid grants under current memberships, scopes and permission evolution; never recreate removed assignments.

## Acceptance criteria

AC-1 (roadmap item 1). One Better Auth instance is built inside the tenant context, reaches Keycloak through the discovery URL of the configured realm, answers on `/api/auth/callback/keycloak`, and stores an account whose token columns are unreadable as plain text in the database. Two tenant contexts in one process each hold their own instance and neither answers for the other. Proves R-4, R-5, R-6, R-7.

AC-2 (roadmap item 2). In `invite` mode an unknown email is refused with the not-registered message and no `user` row and no `session` row is written. A pre-added pending person becomes active on first sign-in. In `jit` mode an unknown email is created active. A person who already exists by email links to the realm account instead of gaining a second row. Proves R-8, R-9, R-10, R-12.

AC-3 (roadmap item 3). The break-glass account signs in at `/admin/login`, is absent from the sign-in page, and refuses a credential that is not the break-glass account with a neutral message and no session. Proves R-62.

AC-4 (roadmap item 3a). With `local_accounts_enabled` on, add person creates the realm account through the `genie-admin` client, triggers the set-password action email, and leaves the `user` row pending. Password reset is a link to the realm. The local realm variant carries no identity-provider redirect. Proves R-40, R-42, R-50.

AC-5 (roadmap item 4). A session is refused after the tenant's idle minutes with no activity, is refused after 24 hours regardless of activity, survives a browser activity call inside the window, and is not extended by ordinary request traffic. The activity call returns the new idle expiry time. The sessions list answers for a session older than a day. The account page shows the person's sessions and their roles with scope and source, and edits neither. Sign-out removes the Genie Ops Center session row and then ends the realm session. The session row records the client address resolved through the trusted proxy list. Proves R-13, R-14, R-15, R-15a, R-16, R-17, R-18.

AC-6 (roadmap item 4a). Add person, resend set-password, and break-glass sign-in each refuse past their window, each refusal writes one `auth:rate_limited` audit row, and the next window overwrites the counter row rather than creating a second one. Proves R-19, R-20, R-21.

AC-7 (roadmap item 5). `syncGroupMemberships` is tested for all three claim cases. A present claim replaces `idp` memberships and creates unseen groups, an empty claim removes them, and an absent claim keeps them and writes `auth:groups_claim_absent`. Local memberships survive every case, a directory group can be archived but not deleted, a stale directory group is computed from `last_seen_at` on read, and a local group delete names both counts. Proves R-22, R-23, R-24, R-24a, R-25.

AC-8 (roadmap item 6). `can()` and `scopesFor()` share one loader that issues one assignment query for many calls in one request, a revoked role is refused on the next request, a record scope and a declared parent scope both grant, `scopesFor()` returns `all` for a tenant-wide assignment, and only `is_break_glass` bypasses. Enabling a module's entitlement appends its admin key to `Tenant administrator` and disabling removes it. The six core keys and the two system roles exist. An assignment through an archived group does not grant. Proves R-26, R-27, R-28, R-29, R-30, R-31, R-32, R-33.

AC-9 (roadmap item 7). The People, Groups, and Roles screens read and write only through the three routers. The server refuses a self-disable, a self-remove, and any write that would leave zero active holders of `Tenant administrator`, whether the last holder is direct or through a group. The break-glass account appears on none of the three. "Resend set-password email" appears only for a pending local-account person. Removing a person revokes access and keeps the audit trail. Proves R-37, R-38, R-39, R-41, R-43.

AC-10 (roadmap item 8). A sign-in, a sign-in refusal, a sign-out, a groups-claim absence, a rate-limit refusal, and every People, Groups, and Roles write each leave one audit row with actor, action, target, and summary. No row contains a token or an emailed link, and every action written comes from the catalogue. The `notification` table exists after the migration. `core:session:new` on a new device writes a notification and sends the new-device email, and `core:role:granted` and `core:role:revoked` write a notification and send the role email. Proves R-11, R-44, R-45, R-46, R-47, R-48.

AC-11 (roadmap item 9). Applying each realm template variant to a fresh Keycloak produces the three clients, the protocol mapper that emits the `groups` claim, PKCE on the sign-in client, trust email, brute-force protection, and a realm display name equal to the company name. The local variant also produces email verification, the password policy, and the realm SMTP settings. The redirect URI matches the callback path the application uses, only the `groups` claim reaches application code, and a local account keeps its account type after the setting is turned off. Proves R-49, R-49a, R-50, R-51, R-51a.

AC-12 (roadmap item 9a, setup steps). `genie-ops setup` on a stack whose `setup_step` table already holds the Section 1 steps runs only the five identity steps, in the recorded order and after `seed`, so the `roles` step finds a `tenant_module` row for every compiled module. It records each step, resumes after an induced failure, and refuses the realm step with a clear message when the bootstrap credential is absent. The bootstrap credential appears in no file and no log, and the break-glass password is printed once and nowhere else. Proves R-52, R-53, R-54, R-55, R-56, R-57.

AC-13 (roadmap item 9a, commands). `idp set`, `admin add`, and `break-glass rotate` each perform their one action and each leave exactly one `ops:<command>` audit row with the operating-system user and the non-secret arguments. `break-glass rotate` clears the authenticator and deletes the account's sessions in one transaction. Proves R-58, R-59, R-60, R-61.

AC-14 (roadmap item 10). The Keycloak hardening checklist exists in `../runbooks/keycloak-realm.md`, names the bootstrap administrator replacement, the external database, the node count, and the monitoring, and is confirmed by an operator on a real deployment. Proves R-70.

AC-15 (roadmap item 11). A first break-glass sign-in forces a password change and then enrollment, every other route answers with the limited-session page until both are done, `can()` refuses everything during that time, completing both revokes the account's other sessions, and the password rule is enforced identically by the meter and the server. The `/admin/account` variant offers change password, re-enroll, and sessions only. Proves R-30, R-63, R-64, R-65, R-66.

AC-16 (roadmap item 12). The Audit log screen is reachable only with `core:audit:read`, filters on all five controls, pages newest first with Load more, offers the operator filter, links a target only when the resolver returns a path the viewer may open, and offers no export. Proves R-67, R-68, R-69.

AC-17 (migration, Section 1 boundary). The core migration applies to a database that holds only the Section 1 history, creates every identity, group, role, and notification table, and adds the foreign keys to `tenant_settings`, `tenant_branding`, `audit_event`, `tenant_api_key`, `file`, and `tenant_integration`. Squawk and `drizzle-kit check` pass on it. Proves R-1, R-2, R-3.

AC-18 (Section 0 item 11 extension). The security headers of Section 0 are present on the sign-in page, `/admin/login`, the limited-session page, and the not-set-up page. Each of the five sign-in page states is reached by its own cause, and the not-set-up page lists the identity steps until setup completes. Proves R-17a, R-17b, R-71.

AC-19 (done when). `genie-ops setup` on a fresh stack completes every step, the not-set-up page clears, and the first administrator from `tenant.yaml` signs in through the identity provider, is activated, lands in the workspace, and sees the admin switch. Proves R-52 to R-57, R-10, R-36.

AC-20 (done when). A person assigned in the test identity provider signs in once and a session exists. Proves R-4, R-5, R-6, R-9.

AC-21 (done when). That person appears in People with the groups their sign-in token supplied. Proves R-22, R-23, R-37.

AC-22 (done when). A role assigned to one of those groups reaches the person with no further action. Proves R-27, R-33.

AC-23 (done when). The person sees the module that role grants in their navigation, a person without the role does not, and a direct request to that module's route is refused for the person without the role. Proves R-28, R-34, R-35.

AC-24 (done when). Removing the person from the application assignment in the test identity provider blocks their next sign-in, proved in both onboarding modes: the refusal path in `invite` mode, and the loss of every group-derived role in `jit` mode. Proves R-9, R-11, R-23.

AC-25 (permission evolution). The upgrade matrix in `../architecture/permission-evolution.md` passes against an existing database, including preserved identities/scopes, no silent privilege expansion, ineffective retired/unknown keys, and repeat/failure-safe audited transformations. Browser tests prove unavailable-key presentation and explicit opt-in behavior. Proves R-33a–R-33c; verification details follow.

AC-26 (retained access lifecycle). On the existing-database lifecycle fixture, assert direct/group and broad/narrow grants are ineffective while absent and after reinstall before enable, mixed-role access survives, unavailable grants can be removed, and only valid remaining grants restore after review and activation. Assert role/assignment identity preservation and audited outcomes; E2E proves the real authorization effects. Proves R-33d and CF-MA-10–11.

## Verification

Permission-evolution acceptance (AC-25; R-33a–R-33c): execute every scenario in `../architecture/permission-evolution.md`, Required upgrade verification, against an existing configured database. Include direct/group and scoped/broad grants, independent custom copies, mixed-module roles, archived groups, meaningful authorization denial before explicit new grants, equivalent renames, retired/unknown keys, retries/concurrency, failure/recovery, and audited security revocation. Assert preserved role/assignment IDs and memberships alongside real `can()`/`scopesFor()` outcomes. E2E proves role-editor warnings and denied/allowed behavior at both viewports; Storybook presentation tests alone do not satisfy this gate. These are future test requirements, not completed proof.

Environment-profile regression checks extend Section 0 R-19b and the canonical environment contract. The Section 2 app rejects missing required authentication configuration before connecting, but valid configuration does not require an already-created realm to serve the not-set-up page. App and worker startup do not require bootstrap credentials. A pending realm step without those credentials fails before contacting Keycloak; a rerun with that step complete proceeds without them. `genie-ops migrate` runs without sign-in credentials and starts no listener or job loop. Commands that use auth cryptography or realm administration validate their own consuming profile, rather than inheriting every application requirement.

Section 0 generator follow-through (item 6): update `module-new` test templates and existing generated fixtures to exercise successful protected router reads and browser main paths with real role assignments and the real evaluator. Retain refusal cases. Acceptance requires a newly generated module and an existing fixture to pass all three layers, with browser tests at phone and desktop viewports, without a broadened placeholder grant, test-only bypass, or mocked permission result (`00-monorepo-foundation.md`, R-30 and AC-7; `../architecture/module-contract.md`, Tests row).

Unit tests in Vitest for: the onboarding decision in each mode, the idle comparison against the settings reader, the activity throttle, the password rule shared by meter and server, the rate-limit window arithmetic, the three claim cases of `syncGroupMemberships`, the scope match including declared parents, the navigation permission filter, and the new-device comparison.

Integration tests against a real Postgres through Testcontainers with the real migration histories, and never a mock database: the migration of R-1 applied on top of the Section 1 history, the shared `can()` and `scopesFor()` suite required by `DEC-39` and `DEC-48` including the single-query count and the revoke-applies-next-request test, every self-protection refusal of R-38, the rate-limit counter overwrite, the audit rows of AC-10, and the notification writes. The standing two-context isolation test of `DEC-34` is extended so that each context builds its own Better Auth instance and neither answers for the other. It is never skipped.

Integration tests against a real Keycloak container for anything that touches the realm: applying each template variant, creating a local account and triggering the action email, the `genie-admin` client's rights being limited to its own realm, and the realm-scoped calls of `genie-ops idp set`.

End-to-end tests in Playwright against one seeded deployment with the Keycloak test realm and the local test identity provider that join the compose file in this section, each run at a phone viewport and a desktop viewport (`DEC-25`): the first administrator's sign-in, a group-derived role reaching a person and the module appearing, the removal in the test provider blocking the next sign-in, the idle warning and expiry, sign-out ending both sessions, the break-glass first sign-in through both forced steps, and the audit reader with the operator filter. axe checks run on each screen (`DEC-21`).

Tests that must exist by name, because a later change is likely to drop them:

- The two-context isolation test of `DEC-34`, extended with one Better Auth instance per context. It is never skipped.
- The single-query test and the revoke-applies-next-request test required by the Guard of `DEC-48`.
- The three claim cases required by the Guard of `DEC-41`, run as three separate cases.
- One test per writer named in R-38, each proving the last-administrator refusal on the server and not only in the screen.
- One test that the break-glass account is absent from each of the three screens' reads.
- One test that a limited break-glass session is refused by `can()` and by every router except the two endpoints that clear it.
- One test that the module registry omits a navigation entry whose permission refuses, and that the route behind it still refuses server-side.
- One test per `genie-ops` command proving exactly one `ops:<command>` audit row, as the Guard of `DEC-45` requires.

Manual checks where no automated layer fits: the Keycloak hardening checklist of R-70 on a real deployment, and a confirmation that the one-time break-glass password print is absent from the container log.

## Deferred

- Sign-in page branding. Section 2 renders the sign-in page with the fixed layer only. Section 3 items 2 and 6 give it the tenant logo, background, welcome text, notice, and links from `tenant_branding`. Reopened when Section 3 starts.
- Personal overrides on the account page, which Section 3 item 7 adds to the page this section starts.
- The shell, the navigation tree rendering, and the idle-timeout modal's presentation, which Section 3 item 4 owns. Section 2 owns the server side of the idle rule and the filter that decides what the tree may contain.
- Editing onboarding mode, local accounts, and idle minutes. Section 2 reads all three through the settings reader. Section 3 item 10 delivers the Tenant Settings page that writes them.
- The Modules and Categories pages and the core `category` table, which Section 3 item 11 owns (`DEC-50`, `DEC-51`).
- The inbox screen. The `notification` table and its writers land here, the screen is later (`DEC-21`). Reopened when the first module needs the inbox.
- Record-scope proof end to end. The seam is built here, and Section 4 item 2 proves it on the solutions module (`DEC-39`).
- Audit CSV export and SIEM push (`DEC-16`). Reopened when a customer names a SIEM or a retention period shorter than lifetime.
- Support impersonation. The `session.impersonated_by` column already exists, so a later feature needs no migration (`DEC-15`).
- Personal erasure. Removing a person here revokes and bans. Anonymizing the row is `DEC-17` and Section 5 item 7.
- Branded credential emails for a local-accounts tenant. Keycloak's built-in templates stand, and realm localization overrides are the first step when a customer asks (`DEC-40`).
- A second identity provider in one realm, with a chooser on the sign-in page. Reopened when a customer needs it (`../architecture/access-model.md`, "Where the group list comes from").
- SCIM provisioning. Reopened when a customer requires push-based joiners and leavers (`../core/tech-stack.md`, "Identity and access", `../core/vision.md`, "Non-goals").
- A resolver in front of `syncGroupMemberships` for a provider that cannot restrict its claim to assigned groups. The Guard of `DEC-41` keeps the seam open: the resolver hands the sync a present claim. Reopened when a customer cannot restrict the claim, and it needs its own decision.
- A relationship-based authorization engine behind the `can()` seam. Reopened if a customer's model outgrows scoped roles (ADR 0004, "Consequences").
- Instant effect for a revoked role inside an open request. `DEC-48` names the change: a per-user cache cleared by the assignment write, with every caller unchanged.

Assumptions
- Better Auth 1.7 unifies `genericOAuth` with the built-in social providers, so the callback is `/api/auth/callback/:id`, sign-in is `signIn.social`, and PKCE defaults to on. Verified against the Better Auth 1.7 upgrade guide and the generic OAuth plugin reference through Context7. If wrong, the redirect URI in the realm template and the sign-in call both change, which is two lines and one template value.
- `account.encryptOAuthTokens` is a boolean under `account` that encrypts the existing token columns in place with AES-256-GCM using the application secret and adds no column. Verified against the Better Auth options reference and the token utility source through Context7. If wrong, the `account` table gains columns and R-1 changes.
- `session.disableSessionRefresh` is the option that stops Better Auth from extending a session past `expiresIn`, and `updateAge` is the option that would extend it. Both verified in the Better Auth session management reference. R-13 states the setting as a requirement on that evidence. If the option is renamed or removed in a later release, the 24 hour cap moves into the same per-request check that already enforces the idle rule, which is one more comparison in one place.
- `session.freshAge: 0` disables the freshness check and `session.cookieCache` is off unless enabled. Verified in the same reference. `advanced.ipAddress.trustedProxies` accepts addresses and CIDR ranges and walks forwarded headers from the right. Verified in the Better Auth rate limit and security references.
- Onboarding is enforced in a `databaseHooks.user.create.before` hook that throws an `APIError` to refuse. Verified in the Better Auth database hooks reference. If wrong, the refusal moves to a callback wrapper and the behavior is unchanged.
- Keycloak 26 supplies a Group Membership protocol mapper whose claim name is configurable and which carries a `full.path` flag, and a User Attribute protocol mapper that can emit a multivalued user attribute as a named claim. Both verified against the Keycloak source through Context7. The Group Membership mapper reads realm group memberships only, which is why R-50 gives the brokered variant the User Attribute mapper instead. `full.path` is false where the Group Membership mapper is used, which is the call recorded in `README.md`, so the claim carries bare group names. If a realm ever needs nested groups with duplicate names, the Keycloak 26.8 upgrade note says full paths are the fix, and that changes `group.external_id` for that tenant.
- Keycloak 26 creates a user with `POST /admin/realms/{realm}/users` and sends the set-password email with `PUT /admin/realms/{realm}/users/{id}/execute-actions-email` carrying `UPDATE_PASSWORD`. Verified against the Keycloak administration REST API reference. The older `reset-password-email` endpoint is deprecated and is not used.
- Keycloak realm brute-force settings are realm-representation fields, so the template carries them and no runtime call is needed. Partly verified: the attack-detection endpoints were confirmed, the exact representation field names were not, and `../runbooks/keycloak-realm.md` owns them.
- Rate-limit defaults, chosen because no document sets them and they are reversible constants: add person 30 in one hour per acting person, resend set-password 3 in one hour per target person, break-glass sign-in 10 in fifteen minutes per deployment. If wrong, three constants change.
- The audit action prefix for core identity events is `auth:`, following the one action `DEC-41` already names, `auth:groups_claim_absent`. If wrong, the action strings change and the audit reader's action filter groups them differently.
- `core:session:new` both sends the new-device email and writes the notification. The roadmap names only the notification for that event, `DEC-21` says the table is written by the same events that send email, and the Section 1 template catalogue contains a new-device sign-in template. If wrong, the email is not sent and the template is unused.
- Both `Tenant administrator` and `Auditor` are seeded by the `roles` step of setup. `../architecture/data-shape.md` says the two core system roles are seeded at provisioning, and roadmap item 9a says "the core system roles".
- No contradiction was found between `../core/tech-stack.md` and the verified library behavior. The Better Auth row, the `genericOAuth` row, and the Keycloak row all match what current documentation says.
- The `setup_step` names follow `../architecture/data-shape.md` and the seven-step list the not-set-up design now shows: `migrations`, `realm`, `clients`, `roles`, `admin_seed`, `break_glass`, and `seed`. The identity provider is not among them (`DEC-36`).
- Four design type fields have no column and no contract row because each is server-derived, not stored: `Person.identitySource` and `AccountUser.identitySource` from the account's provider row, `Group.stale` from `last_seen_at` (R-24a), and `Role.entitlementAdded` from the module admin keys of R-31. `TenantSupport.grantedBy` has no source at all and stays a finding for `SPEC_READINESS_REPORT.md`, not a column this specification invents (`../design/README.md`, "Standing check").

Open questions
- Decided by the product owner on 2026-09-18 and no longer open: an archived directory group stops granting (R-32).
- Decided by the product owner on 2026-09-18 and no longer open: Remove revokes and bans and keeps the name; erasure is `genie-ops erase` (R-43, design copy corrected).
- Decided by the product owner on 2026-09-18 and no longer open: the `__Host-` cookie prefix, secure cookies, and the trusted proxy list from `AUTH_TRUSTED_PROXIES` (R-4a).
