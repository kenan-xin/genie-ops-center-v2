# S-E: another SSO system

For the Genie operator and the customer's IT. The customer's company login is not Keycloak and not
Entra ID. Genie Ops Center owns a realm on its own Keycloak server, and that realm brokers to the
customer's provider over OIDC or SAML. This guide covers OIDC (for example Okta, Google) and SAML
(for example ADFS, Ping). LDAP and Active Directory federation is deferred and is not covered; see
the note at the end.

## What you need

- The deployment's `.env`, with `KEYCLOAK_URL` pointing at the Keycloak server that holds the Genie
  Ops Center realm.
- The Genie Ops Center realm's broker reply address, to give the customer:
  `KEYCLOAK_URL/realms/<realm>/broker/company-login/endpoint`.
- The credential and the group claim or attribute name for the protocol the customer uses.

## OIDC

### The customer's side

1. Create an application for Genie Ops Center and register the broker reply address as a redirect
   URI.
2. Create a client secret and copy it once.
3. Emit the groups claim (usually `groups`) with the groups assigned to this application only.
4. Return the issuer or discovery URL, the client id, the client secret, and the claim name.

### The operator's side

5. Run the command.

   ```sh
   docker compose exec app genie-ops idp set \
     --protocol oidc \
     --issuer-url https://id.customer.example \
     --client-id genie-ops-center \
     --client-secret '<the secret>'
   ```

## SAML

### The customer's side

1. Create a SAML application for Genie Ops Center. Register the broker reply address as the
   assertion consumer service (ACS) URL.
2. Note the service-provider entity ID the customer's provider expects for Genie Ops Center; give
   that value to the operator.
3. Emit the groups attribute (usually `groups`) with the groups assigned to this application only.
4. Return the metadata URL and the attribute name.

### The operator's side

5. Run the command.

   ```sh
   docker compose exec app genie-ops idp set \
     --protocol saml \
     --metadata-url https://id.customer.example/metadata \
     --entity-id genie-ops-center
   ```

   The provider's metadata must resolve for Keycloak, not for your own machine.

## Both

6. If the deployment predates the brokered realm's redirector default, add it once by hand, as
   [the realm runbook](../../runbooks/keycloak-realm.md) describes.
7. Open a private browser window at `PUBLIC_URL`, sign in as an assigned person, and make sure the
   browser leaves for the customer's provider. In the Groups screen, their groups are listed with
   source `idp`.
8. Remove the test person from the application assignment and make sure their next sign-in is
   refused. Restore the assignment afterwards.

## LDAP

Deferred. `genie-ops idp set` accepts `oidc` and `saml` only and refuses any other protocol. A
customer whose directory brokers neither is not covered yet; the work and the open credential
choice are recorded under Deferred in
[Spec 2](../../specs/02-identity-and-access.md). Until it lands, ask the customer to expose an OIDC
or SAML application in front of the directory.
