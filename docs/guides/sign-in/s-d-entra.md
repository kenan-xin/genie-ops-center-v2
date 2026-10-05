# S-D: Microsoft Entra ID, no customer Keycloak

For the Genie operator and the customer's Entra ID administrator. The customer does not run
Keycloak. Genie Ops Center owns a realm on its own Keycloak server, and that realm brokers to Entra
ID as an OIDC identity provider. Entra is used here as the named example; the same steps fit any
OIDC identity provider.

## What you need

- The deployment's `.env`, with `KEYCLOAK_URL` pointing at the Keycloak server that holds the Genie
  Ops Center realm.
- The Genie Ops Center realm's broker reply address, to give the customer:
  `KEYCLOAK_URL/realms/<realm>/broker/company-login/endpoint`.
- From the customer's Entra ID administrator: the tenant's issuer URL (or discovery URL), the
  application (client) id, the client secret, and the name of the groups claim (`groups`).

## The customer's side

1. Register an application in Entra ID. Add a web redirect URI: the broker reply address above.
2. Create a client secret and copy its value once.
3. Add the `groups` claim to the tokens (App registrations, Token configuration, Add groups claim,
   Security groups). Restrict the app assignment to the people who must have access; an app with no
   assignment check lets everyone in the tenant reach the sign-in.
4. Return the tenant issuer URL, the application id, the client secret, and the claim name.

## The operator's side

5. Run `genie-ops idp set` on the host.

   ```sh
   docker compose exec app genie-ops idp set \
     --protocol oidc \
     --issuer-url https://login.microsoftonline.com/<tenant-id>/v2.0 \
     --client-id '<application id>' \
     --client-secret '<the secret>'
   ```

   Replace `--issuer-url` with the discovery URL when the customer gives that instead. The client
   secret is never written to a file, a log, or the audit row.

6. If the deployment predates the brokered realm's redirector default, add it once by hand, as
   [the realm runbook](../../runbooks/keycloak-realm.md) describes.

## Verify

7. Open a private browser window at `PUBLIC_URL`. The browser leaves for Entra without showing the
   Genie Ops Center realm's own form.
8. Sign in as an assigned person. They land in the workspace.
9. In the Groups screen, their Entra groups are listed with source `idp`.
10. Remove the test person from the app assignment. Their next sign-in is refused. Restore it
    afterwards.

## When the claim goes missing

Entra omits the `groups` claim for a person in more than 200 groups (150 in SAML). Genie Ops Center
then keeps that person's previous memberships and writes an audit event, rather than dropping every
role. Ask the customer to emit only the groups assigned to the application, which keeps the claim
under the limit. The large-tenant flow is in [S-G](s-g-large-entra-jit.md).
