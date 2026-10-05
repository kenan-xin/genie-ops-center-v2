# Which sign-in setup guide is mine?

For the Genie operator who sets up the deployment. Answer three questions about where the realm
lives and which company login people use. Each answer names the guide to follow.

1. Who hosts the realm?
   - Genie hosts it on a shared Keycloak server: scenario S-A,
     [Ops Center hosts the customer](s-a-ops-center-hosts.md).
   - The customer's own Keycloak holds the realm, brokered into ours: scenario S-B,
     [Your Keycloak, brokered](s-b-your-keycloak-brokered.md).
   - Ops Center is only a client in the customer's realm: coming.

2. Does the customer already run a Keycloak?
   - No, Genie runs the realm for them: S-A.
   - Yes: S-B, brokered into a realm Genie owns on their server. Client-only mode is coming.

3. Which company login do people use?
   - A local account in the realm for this deployment: coming.
   - A company identity provider: [Microsoft Entra ID](s-d-entra.md), or
     [another SSO system](s-e-other-sso.md) for Okta, Google, ADFS or Ping. A large Entra tenant
     that signs everyone in at once follows [S-G](s-g-large-entra-jit.md) after S-D. LDAP and
     Active Directory federation is deferred (Spec 2, Deferred).

## Guides

Only a guide whose scenario is built and tested is listed as written. The rest are coming.

| Scenario | Guide | Status |
| --- | --- | --- |
| S-A: Genie hosts the realm on a shared Keycloak server | [s-a-ops-center-hosts.md](s-a-ops-center-hosts.md) | Written |
| S-B: the customer's Keycloak, brokered into ours | [s-b-your-keycloak-brokered.md](s-b-your-keycloak-brokered.md) | Written |
| S-C: Ops Center as clients in the customer's realm only | s-c-your-keycloak-client-only.md | Coming |
| S-D: Entra, no customer Keycloak | [s-d-entra.md](s-d-entra.md) | Written |
| S-E: another SSO system (OIDC or SAML) | [s-e-other-sso.md](s-e-other-sso.md) | Written |
| S-F: no SSO, local accounts | s-f-local-accounts.md | Coming |
| S-G: large Entra customer, `jit`, group-to-role mapping | [s-g-large-entra-jit.md](s-g-large-entra-jit.md) | Written |
