# Keycloak realm runbook

Status: 2026-09-18. This is a planned procedure. No command in this runbook has been executed. Nothing here has been verified against a running Keycloak server. Genie Ops Center has no application code yet, so `genie-ops setup` and `genie-ops idp set` describe intended behavior only. The first provisioning must confirm every step and correct this file. Decisions behind this runbook: ADR 0002, ADR 0006, `DEC-2`, `DEC-8`, `DEC-10`, `DEC-11`, `DEC-36`, `DEC-37`, `DEC-40`, `DEC-41`.

This runbook is the realm half of `deployment.md`. Read `deployment.md` first. It owns the stack, the hosting modes, and the order of the setup steps. This file owns the realm, its template, the customer's identity provider, and the checks around both. The access model behind the `groups` claim is in `../architecture/access-model.md`.

## How to read this runbook

Three kinds of statement appear here, and each is marked.

| Kind | Marker | Meaning |
| --- | --- | --- |
| Planned platform behavior | "Planned." | A `genie-ops` command that does not exist yet. The roadmap says when it is built. |
| Keycloak behavior | "Keycloak." | Current Keycloak 26 behavior or a realm setting, checked against the Keycloak documentation. |
| Operator step | A numbered step | Work a person does in the Keycloak admin console, on the host, or in the customer's provider. |

A claim that could not be verified carries "(to confirm at first provisioning)" and appears again under "Unverified claims".

## Where the realm templates live

Two templates live in the repository under `deploy/keycloak/`.

| File | Variant | Used when |
| --- | --- | --- |
| `realm-template.json` | Brokered | The customer has an identity provider. |
| `realm-template.local.json` | Local accounts | `local_accounts` is true in `tenant.yaml` (`DEC-10`, `DEC-36`). |

One customer delta file sits beside them, in `customers/<slug>/deploy/realm.overrides.json`. It holds only the values that differ for that customer. Keep it small. A value that the template already sets correctly must not be repeated there.

Planned. `genie-ops setup` reads `local_accounts` from `tenant.yaml`, picks the variant, merges `realm.overrides.json` over it, and applies the result. The realm name is derived from the customer slug by the tenant generator, so it is not a field in any configuration file (`DEC-35`). The realm display name is set to the company name from `branding.seed.json` (`DEC-40`). No other branding value is ever written to the realm.

## What the realm template guarantees

The template exists so that every realm is identical on the points that matter. A setting listed here is a guarantee. If a realm loses one of these, sign-in, group mapping, or account creation breaks.

### The clients

| Client | Kind | Purpose |
| --- | --- | --- |
| `genie-ops-center` | Confidential, standard flow | Sign-in for the application. Its secret is `KEYCLOAK_CLIENT_SECRET` in `.env`. |
| `genie-studio` | Confidential, standard flow | The second product in the same realm, so a person signs in once for both (`DEC-8`). |
| `genie-admin` | Confidential, service account | Used by `genie-ops` for account work inside this realm only. Its secret is `KEYCLOAK_ADMIN_CLIENT_SECRET`. |

The `genie-ops-center` client carries these values.

- Redirect URI: `PUBLIC_URL/api/auth/callback/keycloak`. This is the Better Auth `genericOAuth` callback path and it is fixed (`../core/tech-stack.md`).
- Post-logout redirect URI: `PUBLIC_URL`. Sign-out ends the application session and then the realm session (`DEC-11`).
- Web origin: `PUBLIC_URL`.
- PKCE challenge method: `S256`.

Keycloak. The client setting named "PKCE method" takes `S256`, `plain`, or blank. Blank means that Keycloak accepts PKCE but does not require it. `S256` means that Keycloak requires PKCE with SHA-256 for that client. Set `S256`, because an authorization code stolen without the verifier is then useless.

Keycloak. Post-logout redirect URIs are a client attribute, and the values are joined with `##` when several are set. From Keycloak 26.6 the `secure-client-uris` client policy executor requires HTTPS on post-logout redirect URIs, so a plain HTTP address fails validation under that policy.

The application never inspects the request hostname. `PUBLIC_URL` is the one address the realm points at (`DEC-19`).

### The `genie-admin` service client

The service account of `genie-admin` holds roles of the `realm-management` client of this realm. It holds no role in the `master` realm, so it cannot touch another customer.

Keycloak. `manage-users` is the role that covers creating, updating, and deleting users and groups. `view-users` covers reading a user. `query-users` and `query-groups` cover listing and filtering. `manage-users` is the smallest role that covers the local-account work: create the account, send the set-password email, and resend it.

Keycloak. The set-password email is sent by `PUT /admin/realms/{realm}/users/{id}/execute-actions-email`. The email carries a link that performs the required actions, for example `UPDATE_PASSWORD`. The verify-email variant is `PUT /admin/realms/{realm}/users/{id}/send-verify-email`.

Keycloak. Updating the realm itself, which includes the display name and the SMTP settings, requires `manage-realm`, not `manage-users`. Writing an identity provider requires `manage-identity-providers`.

The role set is settled (`docs/specs/README.md`, "Cross-section calls made in the drafting round"). The `genie-admin` service account holds exactly `manage-users`, `view-users`, `query-users`, `view-clients`, and `manage-identity-providers`, and nothing more. `manage-users` covers the local-account work and erasure. `view-clients` lets the `clients` step of `genie-ops setup` verify the three clients. `manage-identity-providers` covers `genie-ops idp set`. `manage-realm` and `manage-clients` are not held, because the three clients, their secrets, their redirect URIs, the realm display name, and the SMTP settings are all written at realm creation with the one-run bootstrap credential (`DEC-37`, `DEC-40`); the `clients` step only verifies them. Make sure at the first provisioning that no command fails for a missing role with this set (to confirm at first provisioning).

### The `groups` claim

Genie Ops Center reads one claim and nothing else: `groups` (`../architecture/access-model.md`). The template puts the protocol mapper that produces it on the client scope that the `genie-ops-center` client uses.

Keycloak. Two different mappers can produce that claim, and they read different sources.

- The Group Membership protocol mapper reads the person's group memberships inside the realm. Its `full.path` property defaults to `true`, which emits `/Finance-Managers` rather than `Finance-Managers`.
- The User Attribute protocol mapper reads a user attribute and writes it into a claim. It must be multivalued for a list of group names.

Keycloak. A brokered person has no realm group membership by default. The identity provider mapper imports the provider's claim or attribute into a user attribute, and the User Attribute protocol mapper then emits it as `groups`. A local account and an LDAP-federated account do have realm group memberships, so the Group Membership mapper serves them.

The claim carries bare group names, never paths (`docs/specs/README.md`, "Cross-section calls made in the drafting round"). Set `full.path` to `false` on the Group Membership mapper. Let the identity provider mappers import the names exactly as the provider sends them. Genie Ops Center matches a `group` row on that plain name (`../architecture/access-model.md`). Make sure at the first provisioning that the emitted claim carries no leading slash (to confirm at first provisioning).

One claim name must have one producer. The brokered template carries the User Attribute mapper. The local-accounts template carries the Group Membership mapper. LDAP federation creates real realm groups, so it uses the Group Membership mapper as well.

### Shared realm settings

| Setting | Value | Why |
| --- | --- | --- |
| `sslRequired` | `external` at least | Keycloak refuses plain HTTP from a public address. Use `all` when Keycloak terminates TLS itself (to confirm at first provisioning). |
| `bruteForceProtected` | `true` | Sign-in brute force is the realm's job, not the application's (`DEC-31`, Section 2 item 4a). |
| `failureFactor` and the wait values | Explicit numbers | See the note below. |
| `emailTheme` | Present and empty | Keeps a theme a template value rather than a schema change (`DEC-40`). |
| `displayName` | The company name | Written at realm creation with the bootstrap credential. Printed by Keycloak's built-in credential emails (`DEC-40`). |
| Trust email on the identity provider | `true` | The provider already verified the address (to confirm at first provisioning). |

Keycloak. Brute force detection is disabled by default, and every brute force number in the realm representation defaults to zero when it is absent. Write `bruteForceProtected`, `failureFactor`, `waitIncrementSeconds`, `maxFailureWaitSeconds`, and `maxDeltaTimeSeconds` as explicit values in the template. A value left out is not a safe default.

### Session and token settings

The application owns the session, not the realm. The idle timeout is 15 minutes by default, read per request from tenant settings, and the absolute cap is 24 hours (`DEC-46`). The realm must not undo that.

Keycloak. When the realm values are unset, SSO session idle falls back to 30 minutes and SSO session max falls back to 10 hours. A realm session that outlives the application session makes the next sign-in silent, which hides an expiry from the person.

The realm values are fixed template values (`docs/specs/README.md`, calls table row "Realm session settings"). Set `ssoSessionIdleTimeout` to 15 minutes and `ssoSessionMaxLifespan` to 24 hours, which are the `DEC-46` defaults. They do not follow the tenant's idle setting and must not be changed per customer.

A tenant administrator changes the idle minutes on Tenant Settings at run time, between 5 and 480. The application enforces that value per request through the settings reader (`DEC-46`). The `genie-admin` client holds no `manage-realm` role, so it cannot rewrite the realm value anyway, and a realm value tied to the setting would drift after the first change.

The short realm idle still matters on a brokered tenant. When the realm session has expired, the next sign-in goes back to the customer's identity provider, which is where offboarding is enforced. A long realm session would let a person who was disabled at the provider sign in again from Keycloak alone. Make sure at the first provisioning that a sign-in after the realm idle window reaches the provider again (to confirm at first provisioning).

Keep the access token lifespan short, because nothing in Genie Ops Center reads the stored provider tokens and the instance encrypts them (`DEC-34`, Section 2 item 1).

### The brokered variant

`realm-template.json` adds these to the shared settings.

- The identity provider redirector is the default authenticator of the browser flow, so a person never sees a Keycloak password form.
- No local registration, no forgot-password link, and no realm password policy, because the realm holds no employee password.
- The User Attribute protocol mapper for `groups`.

Keycloak. The redirector is the `identity-provider-redirector` execution in the browser flow. Set its "Default Identity Provider" configuration to the provider alias. If Keycloak does not find that alias, it shows the login form instead. The same authenticator processes the `kc_idp_hint` query parameter, and a client can override the default with it.

The template ships the redirector execution with no alias, because the provider does not exist until `genie-ops idp set` runs. The command writes the alias.

### The local-accounts variant

`realm-template.local.json` adds these instead (`DEC-10`, Section 2 item 3a).

- No identity provider and no redirector, so the realm's own login form is the sign-in page.
- `verifyEmail` on, so a new account confirms its address.
- A realm password policy, matched to the customer's own rule.
- Brute force protection, as in the shared settings.
- An authenticator app as a required action, offered or required by customer policy.
- SMTP settings, with the sender name and the reply-to address of the tenant, written at realm creation with the bootstrap credential.
- The Group Membership protocol mapper for `groups`, with `full.path` false.
- No email theme (`DEC-40`).

Keycloak. SMTP is the `smtpServer` map on the realm, and `verifyEmail`, `resetPasswordAllowed`, and `registrationAllowed` are realm flags beside it. Keycloak validates the SMTP configuration when the realm is updated, and `POST /admin/realms/{realm}/testSMTPConnection` sends a test message to the signed-in administrator.

The three credential emails of a local-accounts realm are Keycloak's built-in templates, unstyled, printing the realm display name (`DEC-40`). They never go through the Genie Ops Center mailer. A brokered realm never sends them.

## Apply the template

Planned. `genie-ops setup` creates the realm and everything in it. The operator does not create a realm by hand. The full procedure, including the database and the stack, is in `deployment.md`. Only the realm steps are repeated here.

1. Make sure that `KEYCLOAK_URL` in `.env` points at the Keycloak server that holds this realm.
2. Make sure that `KEYCLOAK_REALM` in `.env` matches the realm name that the tenant generator derived from the slug.
3. Make sure that `KEYCLOAK_ADMIN_CLIENT_ID` and `KEYCLOAK_ADMIN_CLIENT_SECRET` are set in `.env`.
4. Obtain a Keycloak server administrator credential for this one command.
5. Run setup with that credential in the environment of the command only.

   ```sh
   docker compose exec -e KEYCLOAK_BOOTSTRAP_USER=admin -e KEYCLOAK_BOOTSTRAP_PASSWORD='...' app genie-ops setup
   ```

6. Make sure that the two bootstrap variables are absent from `.env` afterwards (`DEC-37`).

Warning. If the bootstrap credential is written into `.env`, then every later reader of that file holds rights over every realm on that server. Pass it in the command environment only.

Keycloak. A realm is created with `POST /admin/realms` carrying the whole realm representation, which creates the clients and mappers in the same call. `POST /admin/realms/{realm}/partialImport` applies a file to a realm that already exists, with `ifResourceExists` set to `FAIL`, `SKIP`, or `OVERWRITE`. The first is the path for a fresh realm and the second is the path for a repair.

Setup is resumable through `setup_step` (`../architecture/data-shape.md`). A rerun after the realm step needs no bootstrap credential. The identity provider is not a setup step, because `genie-ops idp set` runs afterwards and a local-accounts deployment never runs it (`DEC-36`).

## Add the customer's identity provider

Planned. `genie-ops idp set` writes the provider into the realm, sets it as the default of the identity provider redirector, and creates the mapper that fills the `groups` claim. The protocol and the credentials are arguments. Nothing about the provider is stored in `customers/<slug>/` (`DEC-36`).

Run the command on the host.

```sh
docker compose exec app genie-ops idp set --protocol oidc ...
```

### OpenID Connect

Arguments: the issuer or the discovery URL, the client id, the client secret, and the name of the claim that carries groups.

Planned. The command creates an identity provider of kind `oidc` and one identity provider mapper of kind Attribute Importer, which copies the named claim into the user attribute that the `groups` protocol mapper reads.

Keycloak. An identity provider mapper has a sync mode. `force` updates the user at every sign-in. `import` writes only at the first sign-in. Use `force`, because group membership changes and must follow the provider at every sign-in.

Keycloak. A JSON claim may be addressed with dots for nesting and brackets for an array index, for example `contact.address[0].country`.

### SAML 2.0

Arguments: the metadata URL or the metadata file, and the name of the attribute that carries groups.

Planned. The command creates an identity provider of kind `saml` and one Attribute Importer mapper for the named attribute, with the same sync mode rule as above.

### LDAP or Active Directory

Arguments: the connection URL, the bind credential, the users distinguished name, and the groups distinguished name.

Keycloak. LDAP is user federation, not identity brokering. It is a component on the realm, not an entry under the identity provider endpoints. A federated person signs in on the realm's own login form with their directory password, so the identity provider redirector plays no part.

Keycloak. The `group-ldap-mapper` component imports directory groups as realm groups. Its mode decides where membership lives. `LDAP_ONLY` keeps membership in the directory. `IMPORT` copies it into the Keycloak database at import. `READ_ONLY` merges both and refuses a write.

Because a federated person holds real realm groups, the `groups` claim comes from the Group Membership protocol mapper, the same one the local-accounts variant uses. A realm that federates LDAP therefore needs that mapper even though it is not a local-accounts realm (to confirm at first provisioning).

### What the customer configures on their side

1. Register the redirect URI `PUBLIC_URL/api/auth/callback/keycloak` for the application client.
2. Register the realm's broker endpoint, `KEYCLOAK_URL/realms/<realm>/broker/<alias>/endpoint`, as the reply address of the provider (to confirm at first provisioning).
3. Restrict the application assignment to the people who must have access.
4. Emit only the groups that are assigned to the application, never every group of the person.

Step 3 is a requirement before a customer switches onboarding to `jit`. In `jit`, Genie Ops Center admits a new person only when their `groups` claim holds a group mapped to one of its roles (`DEC-7` as amended 2026-09-27), so the provider's assignment and those mappings are the two gates. Map the groups before the switch.

Warning. If the provider emits every group of a person, then the claim can exceed the provider's limit and arrive absent. Microsoft Entra ID omits the `groups` claim for a person in more than 200 groups, and for more than 150 in SAML. Genie Ops Center then keeps that person's previous memberships and writes the audit event `auth:groups_claim_absent` (`DEC-41`). Microsoft Entra ID is one example. The same rule is applied to any provider with a limit. Under `jit`, a new person whose claim arrives absent is refused; pre-add them in People.

## Verify after setup

Perform these checks in order. Each one has a single clear answer.

1. Make sure that the realm exists on the Keycloak server and carries the company name as its display name.
2. Make sure that the clients `genie-ops-center`, `genie-studio`, and `genie-admin` exist in the realm.
3. Make sure that the redirect URI of `genie-ops-center` is `PUBLIC_URL/api/auth/callback/keycloak`.
4. Make sure that the PKCE method of `genie-ops-center` is `S256`.
5. Make sure that the service account of `genie-admin` holds its roles on the `realm-management` client of this realm and on no other realm.
6. Make sure that brute force protection is on and that its numbers are not zero.
7. Make sure that the group `Genie Administrators` exists in Genie Ops Center with the role `Tenant administrator` (`../architecture/access-model.md`).
8. Make sure that setup printed the break-glass password once and that it went into the correct secret store (`DEC-24`).

## Verify after `idp set`

1. Open `PUBLIC_URL` in a private browser window.
2. Make sure that the browser lands on the customer's provider without a Keycloak password form, on a brokered realm.
3. Sign in as one first administrator.
4. Make sure that the person lands in the workspace and that the admin switch shows in their menu (`DEC-23`).
5. Open the Groups screen in the admin portal.
6. Make sure that the directory groups of that person are listed with source `idp`.
7. If a group is missing, then inspect the token before changing anything.
8. Ask the customer to remove the test person from the application assignment in their provider.
9. Make sure that the next sign-in of that person is refused.
10. Restore the assignment when the check is done.

To inspect the token, use the Keycloak admin console. Open the client scope that carries the `groups` mapper and run the evaluation for that person. Make sure that the generated access token carries `groups` as a list of plain group names.

Warning. If the `groups` claim is absent rather than empty, then Genie Ops Center keeps the previous memberships and writes an audit event. A broken mapper therefore looks like a working sign-in. Read the audit log after any mapper change (`DEC-41`).

## Operations

### Rotate the `genie-admin` client secret

1. Open the `genie-admin` client in the Keycloak admin console.
2. Regenerate the client secret on the Credentials tab.
3. Copy the new secret into `KEYCLOAK_ADMIN_CLIENT_SECRET` in `.env` on the host.
4. Run `docker compose up -d` to restart the stack with the new value.
5. Make sure that "Add person" works on a local-accounts deployment, or that `genie-ops admin add` works otherwise.

The image holds no secret. The secret enters at run time from `.env` only (`../architecture/environment-contract.md`).

### The provider certificate or metadata changed

A provider rotates its signing certificate, and a SAML provider changes its metadata. Both break sign-in for everyone at once.

1. Ask the customer for the current metadata URL or the current certificate.
2. Run `genie-ops idp set` again with the new values.
3. Make sure that a test sign-in succeeds.
4. If nobody can sign in while the fix is prepared, then use the break-glass account at `PUBLIC_URL/admin/login` to keep the admin screens reachable (`DEC-15`).
5. Sign out of the break-glass account as soon as the fix is done.

A provider that publishes a metadata URL is easier to repair than one that hands over a file. Ask for the URL during onboarding.

### Export the realm as a restore shortcut

The realm is recreated by setup from the template plus `realm.overrides.json`, so it needs no backup. An export still shortens a restore, because it carries the state after `idp set`.

1. Export the realm from the Keycloak admin console after setup and after every `idp set`.
2. Store the export beside the customer's runbook, never in the repository.
3. Make sure that no client secret from the export is stored in a place that `.env` does not already protect.

Keycloak. An export can be imported into an existing realm with partial import, and the operator chooses fail, skip, or overwrite per resource.

### Keycloak server hardening

These are obligations of the Keycloak server, not of the realm. They belong to whoever hosts the server in the chosen hosting mode (Section 2 item 10).

| Obligation | Why |
| --- | --- |
| Replace the temporary bootstrap admin with a named administrator, then delete the temporary one. | A bootstrap admin is temporary by design and is a standing risk. |
| Give Keycloak its own external database, and back it up. | A realm and its local accounts live there. |
| Run more than one node. | One node is a single point of failure for every sign-in. |
| Monitor the server. | A sign-in outage must not be reported by the customer first. |

Keycloak. `KC_BOOTSTRAP_ADMIN_USERNAME` and `KC_BOOTSTRAP_ADMIN_PASSWORD` create a temporary administrator in the `master` realm at the first start, when the `master` realm does not exist yet. The console marks the account as temporary with a banner. From Keycloak 26.4 the welcome page creates a regular administrator instead, but the environment and command-line path still creates a temporary one.

The generated stack never sets them. The operator creates the temporary administrator once with `docker compose run --rm keycloak bootstrap-admin user` on the first deploy (`deployment.md`, "Set up a new customer", step 6).

Those two variable names belong to the Keycloak server. They are not `KEYCLOAK_BOOTSTRAP_USER` and `KEYCLOAK_BOOTSTRAP_PASSWORD`, which `genie-ops setup` reads for one run (`DEC-37`). Do not confuse the pairs.

### Recovery rows that touch the realm

`deployment.md` holds the full recovery table. Three of its rows are realm work.

| Problem | What to do |
| --- | --- |
| Nobody can sign in, because the provider is down or misconfigured. | Sign in with the break-glass account at `PUBLIC_URL/admin/login`, then repair the provider with `genie-ops idp set` on the host. |
| The realm is broken or was deleted. | Run `genie-ops setup` again, then run `genie-ops idp set` again. |
| The last administrator left the company. | Run `genie-ops admin add <email>` on the host, on the customer's written request (`DEC-23`). |

Use the break-glass account only for the rows that name it, and sign out as soon as the fix is done. Every action in that session bypasses the permission checks (`DEC-15`).

## What is not supported

| Not supported | Why | What to do instead |
| --- | --- | --- |
| Setup that edits an existing realm's settings, users, or other clients. | Setup never holds administrator rights in a realm Genie does not own (ADR 0010). | Use the fresh realm (the default), or client-only mode, where the customer imports the two client files Genie ships and keeps the realm duties that ADR 0010 lists. |
| A second identity provider in one realm. | Not described until a customer needs it (`../architecture/access-model.md`). | Record the request and settle it with a decision first. |
| Branding written into the realm. | One template system only (`DEC-40`). | The realm display name is the only branded value, and it equals the company name. |
| A custom Keycloak email theme. | No theme is built or deployed (`DEC-40`). | Local-account credential emails stay on Keycloak's built-in templates. |
| A realm setting changed by hand on a live deployment. | The change is lost at the next setup and drifts from every other realm (ADR 0002). | Change the template, or the customer's `realm.overrides.json`, and run setup again. |

## Unverified claims

Every line here must be confirmed at the first provisioning against a running Keycloak 26 server, and this file corrected.

1. That the settled role set for `genie-admin`, `manage-users`, `view-users`, `query-users`, `view-clients`, and `manage-identity-providers`, carries every planned command, and that no command needs `manage-realm` or `manage-clients` once the clients, the display name, and the SMTP settings are written at realm creation.
2. That the `groups` claim arrives as bare names with `full.path` set to `false`, on a brokered realm and on a local-accounts realm alike.
3. The exact broker endpoint path that a customer registers, `KEYCLOAK_URL/realms/<realm>/broker/<alias>/endpoint`.
4. The Trust Email setting on the identity provider, and whether the brokered variant needs it when the realm does not verify email at all.
5. The correct `sslRequired` value behind a reverse proxy that terminates TLS, together with the Keycloak proxy headers setting.
6. Whether one realm can carry both the User Attribute mapper and the Group Membership mapper on the same claim name without a conflict, which an LDAP realm would need if it also brokers a provider.
7. The exact merge behavior of `realm.overrides.json` over a template, which is a Genie Ops Center design point and not a Keycloak feature.
8. Whether the application idle window and the realm SSO idle timeout can be equal without a race at the boundary.
