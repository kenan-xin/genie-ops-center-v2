# Which sign-in setup guide is mine?

Three questions lead to one guide. Answer them in order; each answer names the guide to follow.

1. **Where does the realm live?**
   - On a Keycloak server Genie runs for you: this is scenario S-A, [Ops Center hosts the
     customer](s-a-ops-center-hosts.md).
   - On your own existing Keycloak: coming (see the table below).
   - On a Keycloak server in this stack that brokers to your identity provider: coming.

2. **Do you already run a Keycloak?**
   - No, we host it for you: S-A.
   - Yes, and Ops Center becomes a client in your realm only: coming.
   - Yes, and we broker your realm into ours: coming.

3. **Which company login do people use?**
   - A local account in the realm for this deployment: coming.
   - A company identity provider (Entra, Okta, Google, ADFS, Ping, LDAP or Active Directory):
     coming, and it sits behind S-A or the brokered guide once those land.

## Guides

Only a guide whose scenario is built and tested is listed as written. The rest are coming.

| Scenario | Guide | Status |
| --- | --- | --- |
| S-A: Genie hosts the realm on a shared Keycloak server | [s-a-ops-center-hosts.md](s-a-ops-center-hosts.md) | Written |
| S-B: the customer's Keycloak, brokered into ours | s-b-your-keycloak-brokered.md | Coming |
| S-C: Ops Center as clients in the customer's realm only | s-c-your-keycloak-client-only.md | Coming |
| S-D: Entra, no customer Keycloak | s-d-entra.md | Coming |
| S-E: another SSO system (Okta, Google, ADFS, Ping, LDAP) | s-e-other-sso.md | Coming |
| S-F: no SSO, local accounts | s-f-local-accounts.md | Coming |
| S-G: large Entra customer, `jit`, group-to-role mapping | s-g-large-entra-jit.md | Coming |
