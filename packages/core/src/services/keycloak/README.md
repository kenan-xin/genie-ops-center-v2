# packages/core/src/services/keycloak

The Keycloak realm administration the `realm` and `clients` setup steps perform (Spec 2 R-52 to
R-54).

## What belongs here

The realm step (D2-3): load the template variant `local_accounts` selects, merge
`realm.overrides.json` with es-toolkit `mergeWith` (lists replace), fill the values core owns
(the client secrets, the redirect URIs, the display name, the SMTP settings), check the override
against the allow-list, and create the realm in one `POST /admin/realms`. The clients step (R-54):
verify the three clients through `genie-admin` and record `keycloak_url_at_setup`. The admin REST
client, the realm representation builder, and the URL normalization live beside the two steps.

## What must not go here

A second database connection, a realm call that is not a setup step (Add person's local-account
work and `genie-ops idp set` land with their own consumers), and the Section 0 environment schema.
The Section 2 realm values are read from the raw environment at step time, never added to the
Section 0 `validateEnvironment`.

## What it imports

The tenant-config loaders and the tenant context, the schema for the two `tenant_settings` columns,
es-toolkit, and the image's native `fetch`. Nothing else.
