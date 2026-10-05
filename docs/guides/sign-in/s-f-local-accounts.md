# S-F: no SSO, local accounts

For the Genie operator. The deployment has no company identity provider: people sign in with a
local account that Genie Ops Center creates in the tenant realm, and Keycloak sends the
set-password email. The realm is the managed local-accounts variant
([Spec 2, the realm template](../../specs/02-identity-and-access.md)).

Follow the steps in order.

## What you need

- The deployment's `.env`, `tenant.yaml`, and the stack's generated `compose.yaml` and
  `.env.example`.
- A mailbox the deployment can send from, for the realm's set-password email. Keycloak sends this
  email itself, so the realm needs its own SMTP settings.
- The Genie Ops Center administrator who adds people.

## Steps

1. Choose local accounts. In `tenant.yaml` set `local_accounts: true`. This selects the realm
   variant that carries email verification, a password policy, an optional authenticator app, and
   per-realm SMTP, and that adds no identity-provider redirect. `realm: customer` with
   `local_accounts: true` is refused by the schema, because client-only mode has no local accounts.

2. Generate the stack. Run the tenant generator so `compose.yaml` and `.env.example` match
   `tenant.yaml`, then fill `.env`. Keep `COMPOSE_PROFILES=bundled-keycloak` and point
   `KEYCLOAK_URL` at the bundled realm unless the realm lives on a server you already run, in which
   case follow [S-A](s-a-ops-center-hosts.md) for the address rules and keep `local_accounts: true`.
   [The environment contract](../../architecture/environment-contract.md) names every value.

3. Set the realm's mail. The `realm` step writes the realm's SMTP settings from the deployment's
   configuration, so the set-password email is sent by Keycloak, not by Genie Ops Center. Set the
   mail values the deployment reads, and the realm SMTP values the runbook names, before setup.

4. Run setup with the bootstrap credential. Run `genie-ops setup` with `KEYCLOAK_BOOTSTRAP_USER`
   and `KEYCLOAK_BOOTSTRAP_PASSWORD` in the environment of that one command. The `realm` step
   applies `realm-template.local.json` and records `realm_supports_local_accounts`, so the Tenant
   Settings page knows this realm can hold local accounts. The credential is never stored
   ([realm runbook](../../runbooks/keycloak-realm.md)).

5. Set the `genie-admin` secret. Put the `genie-admin` service client's secret in `.env` as
   `KEYCLOAK_ADMIN_CLIENT_SECRET`. Genie Ops Center uses this client to create a person's realm
   account and to trigger the set-password email. It is not set in client-only mode, where no
   `genie-admin` client exists.

6. Turn on local accounts and add a person. In the admin portal, the tenant administrator turns on
   local accounts if it is not on already, opens **People**, and adds a person with the account
   type **Local password**. Genie Ops Center creates the person as pending and triggers the realm's
   set-password email; the person's Profile tab then offers **Resend set-password email** until
   their first sign-in.

7. The person sets a password and signs in. They open the set-password email, set a password that
   meets the realm policy, and sign in. Their first sign-in sets them active. Removing the person
   later ends their sessions, bans them, and drops their group memberships and direct roles; their
   name, email, and audit trail stay. Remove is a Genie Ops Center action only: it does not disable
   the person's realm account, so a local account can still sign in to the other client in the same
   realm, for example genie-studio. Disable the realm account itself in Keycloak when the person
   must lose access to every client.

## What stays true when the setting changes

A local account is fixed at creation. Turning local-account creation off keeps existing local
accounts signing in and resetting their password, because the setting governs the creation of new
accounts only. A local account created while the setting was on still shows its account type after
the setting is turned off
([Spec 2, R-51a](../../specs/02-identity-and-access.md)).
