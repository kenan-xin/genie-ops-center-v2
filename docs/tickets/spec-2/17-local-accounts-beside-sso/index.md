# S2-17: Local accounts beside SSO in a brokered realm

Bead: `d8l5.26`. Status and claims live in Beads, not in this document.

## Governing documents

- [Decision log](../../../core/decision-log.md), `DEC-36`, amendment of 2026-10-27, which this ticket implements. Also `DEC-10`, `DEC-37` and `DEC-40`.
- [Spec 2](../../../specs/02-identity-and-access.md), amendment of 2026-10-27: R-17c, R-40b, R-50 (added paragraph), R-53a, R-58a and AC-27. The owner approved the amendment on 2026-10-27.
- [Realm runbook](../../../runbooks/keycloak-realm.md) and [ADR 0010](../../../adr/0010-client-only-mode-in-an-existing-realm.md).
- The [Spec 2 ticket index](../README.md).

## Dependencies

Depends on: decision bead `cvij.1` (closed). It needs no other open ticket. It starts after the Spec 3 pending-fixes Auto Run, because both use the dev app, port 3000 and the merge gate.

## Scope

1. The operator command `genie-ops realm local-accounts enable` of R-58a.
2. The `realm` step rule of R-53a, so a setup rerun keeps the change.
3. The domain refusal in Add person of R-40b, with its dialog error.
4. The two sign-in entries of R-17c. Section 3 owns their layout and copy, so the sign-in story and design gain the two-entry state.
5. The migration for `tenant_settings.sso_email_domains`, and that column in `docs/architecture/data-shape.md`. A runbook section in `docs/runbooks/keycloak-realm.md`, and the command in the deployment guide's command list.

## Acceptance

AC-27 of Spec 2. The shared definition of done in the [index](../README.md) also applies.
