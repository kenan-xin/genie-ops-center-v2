# S-C: Ops Center as a client in the customer's realm only

For the customer's Keycloak administrator, with the Genie operator. The customer already runs one
company realm for many applications and refuses a second one. Genie Ops Center and genie-studio are
registered as clients in that realm, and setup creates no realm and no admin service client. This is
client-only mode (`realm: customer` in `tenant.yaml`, [ADR 0010](../../adr/0010-client-only-mode-in-an-existing-realm.md),
Specification 02 R-54a).

Sign-in is the same OIDC flow as every other scenario: Ops Center reads `sub`, `email` and `groups`
from the token, keeps its own session, and decides every permission itself. What changes is that the
realm is the customer's, so Ops Center holds no administrator rights in it.

## What you need

- Two client files from the repository, `deploy/keycloak/genie-ops-center.client.json` and
  `deploy/keycloak/genie-studio.client.json`. They carry no secret.
- This deployment's `PUBLIC_URL` (the address people open, for example `https://ops.company.example`).
- The redirect URI for the genie-studio deployment, from that product's own configuration.
- The company name and the first administrators that belong in `tenant.yaml` (the operator supplies
  these; they are not Keycloak values).

## The customer's side

The customer's Keycloak administrator does this in their own realm, exactly as for their other
applications.

1. Import `genie-ops-center.client.json` as a new client. Replace every
   `https://replace-with-your-public-url.invalid` with this deployment's `PUBLIC_URL`, so the
   redirect URI becomes `PUBLIC_URL/api/auth/callback/keycloak` and the post-logout redirect is
   `PUBLIC_URL`.
2. Import `genie-studio.client.json` the same way, replacing
   `https://replace-with-your-genie-studio-url.invalid` with the redirect URI from the genie-studio
   deployment's own configuration. That product names its callback; take the value from its
   configuration rather than assuming the Ops Center callback path.
3. Keep PKCE on. Both files require it (`pkce.code.challenge.method` is `S256`), so an
   authorization code stolen without the verifier is useless.
4. Keep both protocol mappers on each client. The claim name must be exactly `groups` (plus the
   `genie_groups` marker); Genie Ops Center reads only those two and the name is not configurable.
   The `groups` mapper emits the person's realm groups as bare names (`full.path` off). The
   `genie_groups` marker is a Hardcoded Claim mapper that emits boolean `genie_groups: true`;
   without it, a person with no groups would keep their previous memberships instead of losing them,
   because Keycloak omits an empty `groups` claim. This mapper is not optional.
   - If your realm keeps a person's groups in a user attribute rather than in realm group
     memberships, replace the `groups` mapper with a User Attribute mapper that reads that
     attribute and is multivalued. The marker stays.
5. Restrict the `groups` claim to the groups meant for Genie Ops Center. Otherwise the claim carries
   every realm group the person holds, and the groups sync creates one group per value.
6. Return the `genie-ops-center` client secret to the operator, or tell them the client id you set if
   you renamed the client. Give the `genie-studio` secret to that product's deployment.
7. Keep the realm-level guarantees, because Genie holds no rights in your realm:
   - a short realm session (idle and maximum), so that offboarding at the company login takes effect
     soon;
   - brute-force protection on the realm;
   - the forward to your company login, if this realm brokers one.

Sign-out in Genie Ops Center ends the Ops Center session only. The realm session is the company's
and serves your other applications, so the person stays signed in to those. The next Ops Center
sign-in is silent while the company session lasts.

## The operator's side

8. Put the client secret in `.env` as `KEYCLOAK_CLIENT_SECRET`. If the customer renamed the client,
   set `KEYCLOAK_CLIENT_ID` to the new id; the token's `aud` check uses that value.
9. Make sure `KEYCLOAK_URL` points at the customer's Keycloak and `KEYCLOAK_REALM` names
   their realm. No `KEYCLOAK_ADMIN_CLIENT_SECRET` and no bootstrap credential are used.
10. Set `realm: customer` in `tenant.yaml` and run setup. Do not pass
    `KEYCLOAK_BOOTSTRAP_USER` or `KEYCLOAK_BOOTSTRAP_PASSWORD`.

    ```sh
    docker compose exec app genie-ops setup \
      --tenant-config /tmp/tenant.yaml --branding-seed /tmp/branding.seed.json
    ```

    Setup records the `realm` and `clients` steps as `skipped`, records the `KEYCLOAK_URL` it used,
    and runs the database-only steps (`roles`, `admin_seed`, `break_glass`) as usual. `genie-ops idp
    set` is not available in this mode.

## Verify

11. Open `PUBLIC_URL` in a private browser window and sign in as one of the `first_administrators`
    from `tenant.yaml`. `admin_seed` pre-added them as a pending person, so their first sign-in
    activates them and they land in the workspace.
12. Admission is Genie Ops Center's decision, not a per-client assignment in the customer's realm:
    in `invite` mode only a person an administrator pre-added can sign in, and in `jit` mode a
    person must hold a directory group mapped to an Ops Center role (`DEC-7`, R-9). Add people in
    the People screen, or map their groups before switching to `jit`.
13. In the Groups screen, the person's directory groups are listed with source `idp`.
14. Sign out. The browser lands back on `PUBLIC_URL` and stays signed in to the customer's other
    applications. Signing in again does not ask for the company login form while the company session
    lasts.

If the sign-in completes but the groups are missing, inspect the token in the customer's Keycloak:
the `groups` claim must arrive as a list of plain names, and a missing claim with the `genie_groups`
marker means the person has zero groups (so their previous memberships are removed). A missing claim
with no marker keeps the previous memberships and writes an audit event. See
[the realm runbook](../../runbooks/keycloak-realm.md).
