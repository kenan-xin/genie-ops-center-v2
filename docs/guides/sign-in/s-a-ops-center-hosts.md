# S-A: Genie hosts the realm on a shared Keycloak server

For the Genie operator. Ops Center hosts the deployment, and this customer's realm lives on a
Keycloak server Genie runs for several customers, with one realm per customer. The application is
the plain managed realm, pointed at a server outside the stack
([Spec 2, realm mode](../../specs/02-identity-and-access.md)).

Follow the steps in order.

## What you need

- The deployment's `.env`, and the stack's generated `compose.yaml`.
- The public address that people and the application both reach the Keycloak server at, for example
  `https://id.example.com`. This is `KEYCLOAK_URL`.
- A Keycloak server administrator on that shared server, for the realm-creation step only. Pass its
  username and password in the environment of that one command. They are never stored.
- The client secret you will set for `genie-ops-center` in that realm.
- If this deployment runs genie-studio, the origin people reach it at, for example
  `https://studio.example.com`. Put it in `tenant.yaml` as `genie_studio_url`; setup then fills the
  `genie-studio` client's redirect URIs in the same realm. Omit it when genie-studio does not run,
  and the client keeps no redirect URIs.

## Steps

1. Take the bundled Keycloak out of the stack. Remove `bundled-keycloak` from `COMPOSE_PROFILES` in
   `.env`, and leave every `KC_*` value unset. The stack then starts without its own Keycloak. Never
   start the `keycloak` service by name; [the deployment runbook](../../runbooks/deployment.md) has
   the profile rule.

2. Point the stack at the shared server. Set `KEYCLOAK_URL` in `.env` to the address from "What you
   need". Write it in lower case, with no default port and no trailing slash, for example
   `https://id.example.com`. It is the one address the browser and the application both use. It must
   be the address Keycloak advertises as its issuer, so the app container must resolve and reach it,
   through public DNS or a host mapping to the reverse proxy. Set `KEYCLOAK_REALM` in `.env` to the
   realm name. The generated `.env.example` and
   [the environment contract](../../architecture/environment-contract.md) name every value.

3. Set the client secret. The realm is created with the `genie-ops-center` client. Put its secret in
   `.env` as `KEYCLOAK_CLIENT_SECRET`.

4. Run setup with the bootstrap credential. Run `genie-ops setup` with `KEYCLOAK_BOOTSTRAP_USER` and
   `KEYCLOAK_BOOTSTRAP_PASSWORD` in the environment of that one command. Setup creates the realm on
   the shared server from the shipped template, makes sure that the three clients exist, and records
   the address it used. When `tenant.yaml` sets `genie_studio_url`, it also fills the `genie-studio`
   client's redirect URIs from that origin, and the `clients` step proves them. The realm is named
   from the customer slug. The display name and the SMTP settings come from the deployment's
   configuration. See [the realm runbook](../../runbooks/keycloak-realm.md).

5. Decide what sits behind the realm. If people sign in with a company identity provider, add it now
   by following the guide that matches the provider (S-B to S-G in
   [choose-your-setup.md](choose-your-setup.md)). This guide leaves the realm ready for that and does
   not change it.

6. Make sure that the deployment is ready. `/api/health` answers `ok`, and the first administrator
   from `tenant.yaml` signs in and lands in the workspace.

## The address and issuer checks

After setup has recorded the address, the application refuses to start on either mismatch
([Spec 2, realm mode](../../specs/02-identity-and-access.md)):

- `KEYCLOAK_URL` is not the address setup used. The message is "KEYCLOAK_URL is not the Keycloak
  that setup used".
- The stack is in client-only mode while it still runs its own Keycloak. The message is "client-only
  mode, but the stack runs its own Keycloak".

The two addresses are compared after normalization, so lower case, a default port and a trailing
slash do not matter.

The application also compares the issuer in the realm's discovery document with `KEYCLOAK_URL`
followed by `/realms/<KEYCLOAK_REALM>`. A shared server whose hostname differs from `KEYCLOAK_URL`
is the most likely failure here. The process exits at start with `keycloak_issuer_mismatch`, and
sign-in shows "The identity provider is not the one this deployment was set up with". Make the
hostname in `KEYCLOAK_URL` match the one the server advertises, and start the stack again.

Moving a realm to another Keycloak server is not something setup does. Export the realm from the old
server and import it into the new one, keep the same `KEYCLOAK_URL`, and start the stack again.
