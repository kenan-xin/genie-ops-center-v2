# S-B: the customer's Keycloak, brokered into ours

For the Genie operator and the customer's Keycloak administrator. The customer runs Keycloak and
wants their people to keep the account they already have. Genie Ops Center owns a fresh realm on
the customer's server (the managed realm of [S-A](s-a-ops-center-hosts.md)), and that realm brokers
to the customer's realm as an OIDC identity provider, so a person signs in once and both realms
carry the groups. The two hops are the broker into the customer's realm and the customer's realm
into whatever sits behind it.

This guide assumes the realm already exists. If it does not, follow
[S-A](s-a-ops-center-hosts.md) up to step 4 first.

## What you need

- The deployment's `.env`, and `KEYCLOAK_URL` pointing at the Keycloak server that holds the Genie
  Ops Center realm.
- From the customer's Keycloak administrator: the realm's issuer URL, an OIDC client for Genie Ops
  Center with its client id and secret, and the name of the claim that carries group names (usually
  `groups`).
- The Genie Ops Center realm's broker reply address, to give the customer:
  `KEYCLOAK_URL/realms/<realm>/broker/company-login/endpoint`.

## The customer's side

1. In their Keycloak realm, create a confidential OIDC client for Genie Ops Center. Turn the
   standard flow on.
2. Register the reply address from "What you need" as a valid redirect URI. Genie's broker posts
   the response back there.
3. Add a group membership mapper to that client: claim name `groups`, full path off, so the claim
   carries bare group names and not `/Finance-Managers`.
4. Make sure the client emits only the groups meant for Genie Ops Center, or the two realms carry
   every group the person holds.
5. Return the realm's issuer URL, the client id, the client secret, and the claim name.

## The operator's side

6. Run `genie-ops idp set` on the host with the OIDC arguments. The command writes the provider and
   the mapper that fills `groups`, and the realm already sends sign-in to it.

   ```sh
   docker compose exec app genie-ops idp set \
     --protocol oidc \
     --issuer-url https://id.customer.example/realms/their-realm \
     --client-id genie-ops-center \
     --client-secret '<the secret the customer returned>'
   ```

   The client secret travels only into the realm. It is never written to a file, a log, or the
   audit row. Replace `--issuer-url` with the discovery URL when the customer gives that instead.

7. If the deployment predates the brokered realm's redirector default, add it once by hand, as
   [the realm runbook](../../runbooks/keycloak-realm.md) describes.

## Verify

8. Open a private browser window at `PUBLIC_URL`. The browser must leave for the customer's
   Keycloak without showing the Genie Ops Center realm's own form.
9. Sign in as a person the customer assigned to the application. They land in the workspace.
10. In the Groups screen, the person's directory groups are listed with source `idp`.
11. Ask the customer to remove the test person from the application assignment. Their next sign-in
    is refused. Restore the assignment afterwards.

If the sign-in completes but the groups are missing, inspect the token: the `groups` claim must
arrive as a list of plain names, and a missing claim with the `genie_groups` marker means the
person has zero groups (so their previous memberships are removed). A missing claim with no marker
keeps the previous memberships and writes an audit event. See
[the realm runbook](../../runbooks/keycloak-realm.md).
