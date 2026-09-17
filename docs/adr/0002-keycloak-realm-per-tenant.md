---
status: accepted
date: 2026-09-16
---

# One Keycloak realm per tenant

Keycloak brokers every customer's identity provider for Genie Ops Center. It can host many tenants in one realm through its Organizations feature, or one realm per tenant. We decided on one realm per tenant, created from one realm template by `genie-ops setup`. A tenant is the one customer of a deployment (ADR 0007); Genie-hosted deployments share one Keycloak server with one realm each, and a customer-hosted stack carries its own Keycloak unless the customer already runs one.

## Why

The settings regulated customers negotiate are realm-level in Keycloak and cannot differ per organization inside one realm: session lifetime and idle timeout, multi-factor policy, password and brute-force policy, token lifetimes, login pages, and event retention. A government tenant that requires re-authentication every four hours and a finance tenant that requires FIDO2 cannot share a realm. A realm also has its own user store, so the same email can exist in two tenants without collision, a tenant can be exported or moved as one realm, and a misconfiguration or breach is contained to one customer. Realm-level administration can also be delegated to a customer's IT team without exposing any other tenant.

## Considered options

1. One realm, one Keycloak Organization per tenant. Fewer realms to operate, one issuer for the application, scales to thousands of tenants, and users can belong to several organizations. Rejected for now because security policy is realm-wide, the user store is shared, and Organizations is the newer of the two features with fewer proven patterns in regulated deployments.
2. One realm per tenant. Chosen.

## Consequences

- Realm count is the ceiling. Tens of realms are routine. In the hundreds, cache and startup time need attention. Past that, Organizations inside fewer realms is the fallback, and this decision is revisited.
- Configuration drift across realms is prevented by creating every realm from one template through `genie-ops setup`, never by hand.
- Better Auth already runs one instance per tenant (see ADR 0001), so a per-tenant issuer costs nothing extra.
- A customer-hosted stack carries its own Keycloak server; the realm template is the same.
- A tenant with no identity provider uses local accounts in its realm. Keycloak is then the password store and the sender of invite and reset emails; the Genie Ops Center sign-in path is unchanged. This is a further reason a realm per tenant fits: password policy and second-factor requirements for such a tenant are realm settings.
- genie-studio is a second client in the same tenant realm, so a customer's people sign in once for both products. genie-studio runs one deployment per tenant, so its single-issuer configuration points at the tenant realm with no change to its auth model.
