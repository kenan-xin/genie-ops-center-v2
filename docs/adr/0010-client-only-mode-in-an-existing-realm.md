---
status: accepted
date: 2026-09-27
amends: ADR 0002 (one realm per tenant), ADR 0006 (sign-out)
---

# Client-only mode in a customer's existing realm

A customer that already runs Keycloak with one company realm for many apps can refuse a second realm. Until now, `genie-ops setup` always created a fresh realm from the template (`DEC-36`), and both clients lived in that realm (`DEC-8`). This record adds a second supported mode: Genie Ops Center and genie-studio are registered as clients in the customer's existing realm, and no Genie Ops Center realm exists. The default stays the fresh realm, brokered to the customer's realm. It amends ADR 0002, ADR 0006, and the Decided entries `DEC-2`, `DEC-8` and `DEC-36`.

## Why

Many companies that run their own Keycloak register every app as a client in one company realm. A second realm that brokers to it adds work for their IT team and a second place where people exist. Many self-hosted products offer the client-only shape for this reason. The owner decided on 2026-09-27 to offer both shapes, and the same choice applies when Genie hosts the deployment.

The sign-in path stays the same. Genie Ops Center still talks to one realm as an OIDC client, reads `sub`, `email` and `groups` from the token, keeps its own session, and decides every permission itself (ADR 0004, ADR 0006). What changes is where the realm comes from, what setup does, and what sign-out ends.

## Considered options

1. Keep a fresh realm only (the old `DEC-36`). Every template guarantee holds and setup checks it. Rejected as the only option, because a customer that refuses a second realm cannot use the product.
2. Client-only mode only. Rejected as the only option, because every such deployment then loses setup's checks, local accounts, `genie-ops idp set` and realm-side erasure.
3. Both, with the fresh realm as the default. Chosen.

## Decision

- The fresh realm (brokered to the customer's realm) stays the default for a customer with Keycloak, and the only mode for every other customer.
- In client-only mode, Genie ships one importable client file for `genie-ops-center` and one for `genie-studio`: PKCE required, the redirect URIs derived from `PUBLIC_URL`, and a `groups` protocol mapper on each client, so the mapper changes nothing else in the customer's realm. The files carry no secret. The customer's IT imports them, then returns the `genie-ops-center` client secret to the operator, who puts it in `.env` as `KEYCLOAK_CLIENT_SECRET`, and the `genie-studio` secret to that product's deployment.
- Setup records the mode and skips the steps that create the realm, the clients and the `genie-admin` service client. It never holds an administrator credential for the customer's realm. The configuration field that selects the mode and the column that records it are settled with the section that builds the realm step.
- Genie Ops Center checks what reaches it: at start, the realm's discovery document; at every sign-in, that the token carries the expected `aud`. A missing `groups` claim is recorded as `auth:groups_claim_absent`, as in any realm (`DEC-41`), and the runbook tells the operator to check it after the first administrator signs in.
- Onboarding (`DEC-7`) and per-app access work the same in both modes. In client-only mode, every user of the customer's realm can reach the client unless their IT restricts it, so the customer decides who may reach the client before any open onboarding is switched on.
- Sign-out in client-only mode ends the Genie Ops Center session only. The realm session belongs to the company and serves its other apps, so ending it would sign the person out of all of them. The next Genie Ops Center sign-in is silent while the company session lasts. In the fresh realm, sign-out still ends both sessions (ADR 0006).
- When Genie hosts the deployment, both modes are offered too. In client-only mode the customer's Keycloak must be reachable from Genie's servers, because Genie Ops Center exchanges sign-in codes with it server to server.

## Consequences

- In client-only mode the following are not available, because each needs realm administration in a realm Genie does not own: local accounts created from Add person, `genie-ops idp set`, and deleting the realm user in `genie-ops erase`. The customer's IT does these as for their other apps. `genie-ops erase` still anonymizes the application row. Retirement deletes no realm; the customer's IT removes the two clients.
- The realm-level guarantees of the template become the customer's duties, and the runbook lists them: a short realm session, so that offboarding at the company login takes effect soon; brute-force protection; and the forward to their company login. PKCE, the redirect URIs and the `groups` mapper stay guaranteed, because they live in the client files.
- The client's `groups` mapper emits every realm group the person holds, and the groups sync creates a group for each. The customer's IT restricts the claim to the groups meant for Genie Ops Center, or the group resolver seam of `DEC-41` is reopened.
- The generated stack must be able to leave out its own Keycloak container. Client-only mode cannot ship before that.
- Two realm modes to build, test and support. Every change to sign-in, setup, sign-out or erasure is checked in both, and the end-to-end suite runs sign-in against both.
- `DEC-2` (one realm per customer) still holds: in client-only mode that one realm is the customer's own, not one Genie creates.

## Revisit

If a customer in client-only mode needs local accounts or erasure from Genie Ops Center, the path is a narrowly scoped service client the customer creates and grants in their realm. That needs its own decision, because rights in a shared company realm reach every employee of every app.
