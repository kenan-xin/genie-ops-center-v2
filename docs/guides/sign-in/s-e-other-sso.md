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
   read -rs IDP_CLIENT_SECRET && export IDP_CLIENT_SECRET
   docker compose exec -e IDP_CLIENT_SECRET app \
     genie-ops idp set \
     --protocol oidc \
     --issuer-url https://id.customer.example \
     --client-id genie-ops-center
   ```

   `read -rs` puts the secret into your shell's environment without typing it on the command line,
   so it is not in the command's arguments and not in your shell history; `-e IDP_CLIENT_SECRET`
   passes the name, not the value. The command reads it from the environment, and it never reaches
   a log or the audit row.

## SAML

### The customer's side

1. Create a SAML application for Genie Ops Center. Register the broker reply address as the
   assertion consumer service (ACS) URL.
2. Note the service-provider entity ID the customer's provider expects for Genie Ops Center; give
   that value to the operator.
3. Emit the groups attribute (usually `groups`) with the groups assigned to this application only.
4. Emit an email attribute and name attributes for the person, and tell the operator their names.
   A SAML assertion carries no email unless the provider sends one, and Genie Ops Center refuses a
   token with no email, so the sign-in fails without it. Common names are `email`, `firstName` and
   `lastName`.
5. Return the metadata URL, the group attribute name, and the email and name attribute names.

### The operator's side

6. Run the command. `idp set` writes an Attribute Importer for each named attribute; the defaults
   are `email`, `firstName` and `lastName`.

   ```sh
   docker compose exec app genie-ops idp set \
     --protocol saml \
     --metadata-url https://id.customer.example/metadata \
     --entity-id genie-ops-center \
     --email-attribute mail \
     --first-name-attribute givenName \
     --last-name-attribute sn
   ```

   The provider's metadata must resolve for Keycloak, not for your own machine.

## Both

7. Open a private browser window at `PUBLIC_URL`, sign in as an assigned person, and make sure the
   browser leaves for the customer's provider. In the Groups screen, their groups are listed with
   source `idp`.
8. To block sign-in, remove the person's access at the customer's provider with assignment
   required, or disable or remove them in People. Removing them from every group only leaves them
   signed in with no roles. Restore the assignment afterwards.

## LDAP

Deferred. `genie-ops idp set` accepts `oidc` and `saml` only and refuses any other protocol. A
customer whose directory brokers neither is not covered yet; the work and the open credential
choice are recorded under Deferred in
[Spec 2](../../specs/02-identity-and-access.md). Until it lands, ask the customer to expose an OIDC
or SAML application in front of the directory.
