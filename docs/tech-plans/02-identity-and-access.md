# Spec 2 technical plan

Confidence: 7.6/10. The spec is approved, and the owner settled the four load-bearing points on 2026-09-27. A cold review read the Better Auth 1.7.6 source and corrected D2-1 on the same day. The score stays below 8 for three reasons. No Better Auth code exists yet. One full realm representation in `POST /admin/realms` has not run against Keycloak 26.7.4. Keycloak can drop an empty `groups` claim, and nothing has tested that yet.

Status: drafted on 2026-09-27 from the owner's answers of that day, and corrected after the review in the Traycer artifact `review-section-2-tech-plan`. It supplements [Spec 2](../specs/02-identity-and-access.md) and does not replace its numbered requirements. The per-scenario guides and end-to-end tests come from the Traycer artifact `section-2-identity-scenario-plan`.

## Scope and decision authority

Deliver Section 2 on the Section 1 foundation as built. Today, `genie-ops setup` knows two steps (`SETUP_STEPS` in `packages/core/src/services/setup/index.ts`), `can()` is the Section 0 stub, and no code talks to Keycloak. Better Auth is not installed. The latest release is 1.7.6.

| Accepted direction | Authority |
| --- | --- |
| One Better Auth instance per tenant context, `genericOAuth` with provider `keycloak` | ADR 0006, R-4 to R-8 |
| `jit` admits a person only through a mapped group | `DEC-7` as amended, R-9 |
| A directory group can be added before first sign-in | `DEC-52`, R-24b |
| Client-only mode in a customer's existing realm | ADR 0010, R-54a |
| `bundled-keycloak` Compose profile, host fact in `.env` | R-54b (bead cla) |
| Group claim form: bare names, `full.path` false | `README.md` cross-section calls, R-50 |
| Order: foundations early, behavior late | owner answer, 2026-09-27 |

## Decisions

**D2-1, how the `groups` claim reaches admission and the sync.** Owner answer: option A. In Better Auth 1.7.6, the OAuth callback calls `user.validateUserInfo` on three paths. The paths are a new user, a link to an existing user, and the sign-in of a returning person. Each call receives `source.action` and `source.oauth.profile`, the verified token claims (`oauth2/link-account.mjs` in the published package). One hook therefore does all the work:

1. On every path, it copies the `groups` value and the boolean `genie_groups` marker into a holder for the request. A present `groups` list stays a list. If `groups` is absent and the marker is true, the holder records an empty list. If both are absent, it records `undefined`.
2. On a new user, it applies R-9 in the current onboarding mode.
3. On a link or a returning sign-in, it applies the ban check of R-11.

A refusal returns `{ error: "not_registered" }` or `{ error: "access_disabled" }`. It never throws, because a throw becomes the generic `validation_failed` code. `signIn.social` sets `errorCallbackURL` to the sign-in page, so Better Auth sends the browser there with `?error=<code>`. The sign-in page maps each code to its banner (R-17a). The hook writes the refusal audit row through the tenant context's audit writer, not through the Better Auth adapter. On a new user the hook runs inside a Better Auth transaction, and a refusal rolls that transaction back.

The holder is a mutable object in an `AsyncLocalStorage` store, a member of the tenant context. The catch-all route enters it with `store.run(holder, handler)`, never with `enterWith`. A `databaseHooks.user.create.before` hook sets `status` `active` and `onboarding` `jit` for a `jit` admission. The `session.create.after` hook runs only when the holder was filled by an OAuth callback. So a break-glass or a two-factor session never runs the sync. That hook activates a pending person (R-10), calls `syncGroupMemberships(userId, claim)` (R-22, R-23) and writes `auth:sign_in`.

A pre-added person has a `user` row and no account, so the first sign-in links by email. Better Auth refuses that link while `accountLinking.requireLocalEmailVerified` is true (the default) and the row is not verified. Set `requireLocalEmailVerified` to false and store every email in lower case. A test proves pre-add, sign-in, then `active`. Set `requireIdTokenVerification` on the provider, so that a discovery answer without `jwks_uri` cannot skip the signature and `aud` checks. The claims come from the verified id token, so the mappers need no userinfo change.

**D2-2, the identity provider stand-ins in CI.** Owner answer: option A. The end-to-end stack runs one test Keycloak with two realms. The tenant realm is the one under test. A second realm, `company`, plays the customer's company login as an OIDC provider and as a SAML provider, with its own users and groups. An OpenLDAP container covers LDAP federation. A Mailpit container receives the set-password and invitation emails.

The same `company` realm plays the customer's Keycloak for S-B and S-C, and plays Entra for the S-D and S-G flows. One test removes all groups of a person and expects zero `idp` memberships after the next sign-in. Keycloak can omit an empty multivalued claim. Then "empty" turns into "absent", and the old memberships stay. If the test fails, stop and take it to the owner.

Resolved 2026-09-29 (owner decision): the test proved Keycloak omits an empty multivalued `groups` claim. Both realm templates now give each application client a Hardcoded Claim mapper that emits boolean `genie_groups: true`. The holder treats a missing `groups` claim with that marker as an empty list and removes the person's `idp` memberships. Only when both claims are missing does the `DEC-41` absent case keep memberships and write `auth:groups_claim_absent`. The stop condition above is resolved by this marker rule; the phone and desktop tests still remove every realm group and require zero `idp` memberships.

Behavior only Entra shows (group object IDs, the 200-group overage, nested groups, app assignment) runs against the test tenant "Default Directory" behind sso.001.gs. It runs as a scheduled workflow on `develop` with a manual trigger. It is never a required pull request check. Its credentials go in a repository secret that the owner creates.

**D2-3, how setup creates the realm.** Owner answer: option A. The `realm` step signs in to the `master` realm with `KEYCLOAK_BOOTSTRAP_USER` and `KEYCLOAK_BOOTSTRAP_PASSWORD`. It sends one `POST /admin/realms` with the full realm representation, including the `genie-admin` service account as a `users` entry with its client roles. Core builds the representation in this order:

1. Load the template variant that `local_accounts` selects.
2. Merge `customers/<slug>/deploy/realm.overrides.json` on top, with es-toolkit `mergeWith`. Objects merge key by key, and a list in the override replaces the whole list.
3. Fill the values that core owns: the client secrets, the redirect URIs from `PUBLIC_URL`, the display name and the SMTP settings.
4. Check the result. The override can touch only these top-level keys: `ssoSessionIdleTimeout`, `ssoSessionMaxLifespan`, `accessTokenLifespan`, `passwordPolicy`, `loginTheme`, `internationalizationEnabled`, `supportedLocales` and `defaultLocale`. A new key needs a change to this plan. The list excludes the clients, the `users` list, identity providers and their mappers, user federation, client scopes and protocol mappers, authentication flows, brute-force settings, the email theme, and every secret. A key outside the list refuses the step with a named cause.

The step never logs the built representation, because it holds secrets. It also writes `tenant_settings.realm_supports_local_accounts` (R-52). If the realm already exists, the step leaves it unchanged, writes that column, and records `done`. The `clients` step then makes sure that the three clients exist (R-54).

**D2-4, delivery order.** Owner answer: foundations early, behavior late. The first tickets add the `realm` field of `tenant.yaml`, the identity migration with `realm_mode` and `keycloak_url_at_setup`, and the `bundled-keycloak` profile. Core sign-in is then proven on a managed realm. The Keycloak address guard and the issuer check come next. Client-only mode comes last, because it only removes steps from a flow that already works.

**D2-5, where the instance lives and what it exposes.** The Better Auth instance is a member of the tenant context, over the Drizzle adapter on the context pool (R-4). The `genericOAuth` plugin reads the discovery document once when the instance starts. It drops the provider when that read fails.

So the context always builds the instance at start, and break-glass sign-in works while Keycloak is down (`DEC-24`). If the provider was dropped, the discovery retry of R-54d runs at most every 10 seconds. On the first good answer, the context builds a new instance and swaps the member. Sessions live in the database, so the swap loses nothing. A test proves break-glass sign-in with Keycloak stopped. The discovery check therefore lands in step 2, with the instance.

Only the OAuth callback creates users through Better Auth. Setup steps, operator commands and Add person write `user` and `account` rows with Drizzle on the context pool. Examples are `break_glass`, `admin_seed`, `genie-ops break-glass rotate`, `genie-ops admin add` and Add person. The break-glass password is hashed with the Better Auth password hasher.

`apps/genie` mounts one catch-all route under `/api/auth/` that calls the member's handler. The instance sets `emailAndPassword.disableSignUp`, and the hook of D2-1 refuses every new user that does not come from an OAuth callback. Application columns such as `banned`, `status` and `is_break_glass` are declared with `input: false`, so no Better Auth endpoint can write them. The Better Auth tables are generated once with the Better Auth CLI, copied into `packages/core/src/schema.ts`, and shipped in the one migration of R-1. After that, the core schema is the source of truth.

## Delivery order and gates

1. Foundations. The identity migration (R-1 to R-3), the `realm` field of `tenant.yaml` (R-54a), the `bundled-keycloak` profile (R-54b, bead cla), and the stand-ins of D2-2.
2. Sign-in on a managed realm. The realm templates and the `realm` and `clients` steps (D2-3). Then the Better Auth instance with the discovery check, and sign-out (D2-5). Then onboarding and the groups sync (D2-1), sessions, and the real `can()` and `scopesFor()`. Last, the `roles`, `admin_seed` and `break_glass` steps.
3. Administration and operator commands. Rate limits and the break-glass lifecycle. The People, Groups and Roles screens, with the invitation email (bead zdd) and group labels (bead uxl). Notifications and events, the audit reader, `genie-ops idp set` and `genie-ops admin add`.
4. Guards. The Keycloak address guard of R-54c and the issuer comparison of R-54d. The `aud` check already comes with `requireIdTokenVerification` in step 2.
5. Client-only mode (R-54a, R-17, bead 8i97).
6. Scenarios and acceptance. Each scenario ships its guide under `docs/guides/sign-in/` and its end-to-end test together, as soon as its step exists. Then run the Section 2 acceptance at phone and desktop viewports.

Gate S2-G1 comes after step 1. The migration applies on the Section 1 history and passes Squawk and `drizzle-kit check`. The generated stack starts with the profile and without it.

Gate S2-G2 comes after step 2. On a fresh managed stack, the first administrator from `tenant.yaml` signs in through the `company` realm (AC-19). The two-context isolation test holds with one Better Auth instance per context.

Gate S2-G3 comes at the end. Every Spec 2 acceptance criterion passes except AC-14. Each scenario test passes in CI, and one scheduled Entra run is green.

## Follow-ups outside the tickets

Bead w5a4, the genie-studio cutover on sso.001.gs, waits for the `realm` step and `genie-ops idp set`. Then remind the owner and walk through it live. Do not run it unattended. AC-14, the Keycloak hardening checklist, needs an operator on a real deployment.

## Stop conditions

Stop and seek a revised decision in these cases:

- The holder of D2-1 is not visible in `session.create.after`.
- Keycloak refuses a full realm representation in one `POST /admin/realms`.
- Keycloak drops an empty `groups` claim, so that group offboarding fails.
- A Better Auth option that this plan or Spec 2 names is renamed or missing in the pinned release.
- The `company` realm cannot broker the `groups` claim through two hops.

Record the failed command, the versions and the smallest alternatives. Do not weaken `DEC-34`, `DEC-39`, `DEC-41` or `DEC-48` to pass a gate.

## Assumptions

- The review of 2026-09-27 read the published better-auth 1.7.6 package. It confirmed the three `validateUserInfo` call sites, the email-link rule, the one-time discovery read, and the defaults for `additionalFields`. The first sign-in ticket still proves each of these with a test before it builds on it.
- Keycloak accepts a full realm representation, with clients, mappers and a service-account user, in `POST /admin/realms`. This has not run against 26.7.4.
- The scenario guides go in `docs/guides/sign-in/`, and the real Entra run is scheduled plus manual. The scenario plan asked both questions, and this plan takes its proposals as the defaults.

## Unresolved

- None that blocks the tickets. The Entra repository secret needs the owner before the scheduled run can pass.
