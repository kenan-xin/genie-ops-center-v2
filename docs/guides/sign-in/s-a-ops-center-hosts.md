# S-A: Genie hosts the realm on a shared Keycloak server

You are the Genie operator. Ops Center hosts the deployment, and the realm for this customer lives
on a Keycloak server Genie runs for several customers (one realm per customer). Nothing about this
scenario changes the application: it is the plain managed realm ([Spec 2 R-54a to R-54d](../../specs/02-identity-and-access.md)),
pointed at a server outside the stack.

Follow the steps in order.

## What you need

- The deployment's `.env`, and the stack's generated `compose.yaml`.
- The public address people and the application both reach the Keycloak server at, for example
  `https://id.example.com`. This is `KEYCLOAK_URL`.
- A Keycloak server administrator on that shared server, for the realm-creation step only. Its
  username and password are passed in the environment of that one command and are never stored.
- The client secret you will set for `genie-ops-center` in that realm.

## Steps

1. **Take the bundled Keycloak out of the stack.** Remove `bundled-keycloak` from
   `COMPOSE_PROFILES` in `.env`, and leave every `KC_*` value unset. The stack then starts without
   its own Keycloak (R-54b). The `keycloak` service is never started by name; see
   [the deployment runbook](../../runbooks/deployment.md) for the profile rule.

2. **Point the stack at the shared server.** Set `KEYCLOAK_URL` in `.env` to the address from
   "What you need", written without a trailing slash. It is the one address the browser and the
   application both use, and it must be the address Keycloak advertises as its issuer, so the app
   container must resolve and reach it (through public DNS, or a host mapping to the reverse
   proxy). The generated `.env.example` and
   [the environment contract](../../architecture/environment-contract.md) name every value.

3. **Set the client id and secret.** The realm is created with the `genie-ops-center` client. Put
   its secret in `.env` as `KEYCLOAK_CLIENT_SECRET`. If you rename the client, set
   `KEYCLOAK_CLIENT_ID` to match; the token check uses it.

4. **Run setup with the bootstrap credential.** Run `genie-ops setup` with
   `KEYCLOAK_BOOTSTRAP_USER` and `KEYCLOAK_BOOTSTRAP_PASSWORD` in the environment of that one
   command. Setup creates the realm on the shared server from the shipped template, verifies the
   three clients, and records the address it used (R-54c). The realm is named from the customer
   slug; the display name and SMTP settings come from the deployment's configuration. See
   [the realm runbook](../../runbooks/keycloak-realm.md).

5. **Decide what sits behind the realm.** If people sign in with a company identity provider, add
   it now by following the guide that matches the provider (S-B to S-G in
   [choose-your-setup.md](choose-your-setup.md)). This guide leaves the realm ready for that; it
   does not change it.

6. **Verify.** `/api/health` answers `ok`, and the first administrator from `tenant.yaml` signs in
   and lands in the workspace (AC-19).

## The address guard

After setup has recorded the address, the application refuses to start if `KEYCLOAK_URL` is not
that same address, with the message "KEYCLOAK_URL is not the Keycloak that setup used", and if the
mode is client-only while the stack still runs its own Keycloak, with "client-only mode, but the
stack runs its own Keycloak" (R-54c). Comparison is after URL normalization (case, default port
and trailing slash), so those spellings of one address agree.

Moving a realm to another Keycloak server is not something setup does in this section. Export the
realm from the old server and import it into the new one, keep the same `KEYCLOAK_URL`, and start
the stack again.
