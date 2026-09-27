---
status: accepted
date: 2026-09-27
---

# Client-only mode in a customer's existing realm

A customer that already runs Keycloak with one company realm for many apps can refuse a second realm. Until now, `genie-ops setup` always created a fresh realm from the template (`DEC-36`), and both clients lived in that realm (`DEC-8`). This record adds a second supported mode: Genie Ops Center and genie-studio are registered as clients in the customer's existing realm, and no Genie Ops Center realm exists. The default stays the fresh realm, brokered to the customer's realm. It amends ADR 0002 and the Decided entries `DEC-2`, `DEC-8` and `DEC-36`.

## Why

Most companies that run their own Keycloak register every app as a client in one company realm. A second realm that brokers to it adds work for their IT team and a second place where people exist. Self-hosted products usually offer the client-only shape for this reason. The owner decided on 2026-09-27 to offer both shapes, and the same choice applies when Genie hosts the deployment.

The application code does not change. Genie Ops Center still talks to one realm as an OIDC client, reads `sub`, `email` and `groups` from the token, keeps its own session and decides every permission itself (ADR 0004, ADR 0006). Only where the realm comes from, and what setup does, change.

## Considered options

1. Keep a fresh realm only (the old `DEC-36`). Every template guarantee holds and setup checks it. Rejected as the only option, because a customer that refuses a second realm cannot use the product.
2. Client-only mode only. Rejected as the only option, because every such deployment then loses setup's checks, local accounts, `genie-ops idp set` and realm-side erasure.
3. Both, with the fresh realm as the default. Chosen.

## Decision

- The fresh realm (brokered to the customer's realm) stays the default for a customer with Keycloak, and the only mode for every other customer.
- In client-only mode, Genie ships one importable client file for `genie-ops-center` and one for `genie-studio`: PKCE required, the redirect URIs derived from `PUBLIC_URL`, and a `groups` protocol mapper on each client, so the mapper changes nothing else in the customer's realm. The customer's IT imports them.
- Setup records that the realm is external and skips the steps that create the realm, the clients and the `genie-admin` service client. It never holds an administrator credential for the customer's realm.
- Genie Ops Center checks what reaches it: at start, the realm's discovery document; at the first sign-in, that the token carries the expected `aud` and a `groups` claim. A misconfigured client fails loudly with a named cause.
- Per-app access works the same in both modes: each app admits a person added by hand in that app, or a member of a group mapped to one of its roles.
- When Genie hosts the deployment, both modes are offered too. In client-only mode the customer's Keycloak must be reachable from Genie's servers, because Genie Ops Center exchanges sign-in codes with it server to server.

## Consequences

- In client-only mode the following are not available, because each needs realm administration in a realm Genie does not own: local accounts created from Add person, `genie-ops idp set`, and deleting the realm user in `genie-ops erase`. The customer's IT does these as for their other apps. `genie-ops erase` still anonymizes the application row.
- The realm settings the template guaranteed become the customer's duty, and the runbook lists them: a short realm session, so that offboarding at the company login takes effect soon; brute-force protection; and the automatic forward to their company login.
- The generated stack must be able to leave out its own Keycloak container (bead cla). Client-only mode cannot ship before that.
- Specification 02 must describe both modes in its realm requirements (R-49 to R-53) before it is approved.
- `DEC-2` (one realm per customer) still holds: in client-only mode that one realm is the customer's own, not one Genie creates.

## Revisit

If a customer in client-only mode needs local accounts or erasure from Genie Ops Center, the path is a narrowly scoped service client the customer creates and grants in their realm. That needs its own decision, because rights in a shared company realm reach every employee of every app.
