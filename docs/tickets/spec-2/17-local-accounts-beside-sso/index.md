# S2-17: Local accounts beside SSO in a brokered realm

Bead: `d8l5.26`. Status and claims live in Beads, not in this document.

## Governing documents

- [Decision log](../../../core/decision-log.md), `DEC-36`, amendment of 2026-10-27, which this ticket implements. Also `DEC-10`, `DEC-37` and `DEC-40`.
- [Spec 2](../../../specs/02-identity-and-access.md): R-40, R-40a, R-41, R-49 to R-53. This ticket amends them first.
- [Realm runbook](../../../runbooks/keycloak-realm.md) and [ADR 0010](../../../adr/0010-client-only-mode-in-an-existing-realm.md).
- The [Spec 2 ticket index](../README.md).

## Dependencies

Depends on: decision bead `cvij.1` (closed). It needs no other open ticket.

## Scope

1. Amend Spec 2 before the code: the enable command, the domain refusal, and the sign-in hint. Get owner approval for the amendment.
2. Add the operator command `genie-ops realm local-accounts enable --sso-domain <domain>`. The flag can repeat. The command takes the bootstrap credential (`DEC-37`) and, in one run:
   - changes the realm's browser flow so that the login page shows the password form beside the provider button;
   - writes the local-accounts parts of the realm template: email verification, the password policy, the realm SMTP settings, and the Group Membership mapper;
   - stores the domains in a new `tenant_settings` column and sets `realm_supports_local_accounts` to true;
   - writes one audit event.

   The command is idempotent. It refuses client-only mode, a realm with no identity provider, and a run without SMTP settings.
3. Add person refuses `accountType` `local` for an email on a recorded domain, with a named error that the dialog shows.
4. The provider button on the application's sign-in page passes `kc_idp_hint`, so a brokered person skips the realm page.
5. Add the migration for the new column. Add a runbook section, and add the command to the deployment guide's command list.

## Acceptance

- An integration test runs the command against the stand-in Keycloak. The realm then shows the password form and the provider button. A second run changes nothing. The command refuses client-only mode.
- An integration test proves that Add person refuses a local account on a recorded domain, and accepts one on another domain.
- An end-to-end test, at phone and desktop: an administrator adds a local person outside the SSO domains, that person sets a password from the realm's email in Mailpit, and signs in. A brokered person still signs in through the provider with no extra page.
- The shared definition of done in the [index](../README.md) also applies.
