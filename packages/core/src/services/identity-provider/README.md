# packages/core/src/services/identity-provider

The `genie-ops idp set` command (Spec 2 R-58).

## What belongs here

The work behind `genie-ops idp set`: refuse in client-only mode, import the provider's metadata
through the realm-scoped `genie-admin` client, write or replace the OIDC or SAML identity provider,
upsert the Attribute Importer mapper that fills the `groups` user attribute (with the sync mode
that clears the attribute when the claim is empty), and point the browser flow's
identity-provider-redirector at the provider alias. LDAP federation is deferred, so the command
accepts OIDC and SAML only. The provider's client secret is never logged, written to an audit row,
or put in an error message.

## What must not go here

The admin REST client itself, which lives in `services/keycloak/` beside the setup steps. Setup
steps, and the operator audit row, which the runner owns.

## What it imports

The Keycloak admin REST client and realm base/admin-client readers, the tenant context and the
`tenant_settings.realm_mode` column, and the native `fetch`.
