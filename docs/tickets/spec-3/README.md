# Spec 3 ticket breakdown

Spec: [Shell, branding and design system](../../specs/03-shell-branding-and-design-system.md), re-approved 2026-10-22. Technical plan: [03-shell-branding-and-design-system.md](../../tech-plans/03-shell-branding-and-design-system.md). Beads epic: `genie-ops-center-v2-6wz1`. The owner approved this breakdown on 2026-10-22. Beads owns live status, claims and blockers. These documents own ticket scope and acceptance.

## Definition of done for every ticket

- The ticket's acceptance criteria pass at a phone and a desktop viewport for every screen (`DEC-25`, amended 2026-10-22).
- For UI: documented Storybook stories first, then failing behavior tests, then the code ([UI development workflow](../../architecture/ui-development.md)). Each story matches its design capture.
- The anti-slop browser scan (`npx impeccable detect`) is clean on every story the ticket touched.
- axe passes on every end-to-end screen the ticket touched.
- `pnpm gate:merge` is green before the merge.
- R-63, R-64 and AC-8 are part of this definition of done for every ticket.

The owner approved two changes on 2026-10-22, after the [ticket critique](#critique-of-2026-10-22): S3-04 split into S3-04a and S3-04b, and the Keycloak page fix in S3-08 is limited to realm settings or a built-in theme.

## Tickets

| Ticket | Bead | Depends on | Folded beads | Title |
| --- | --- | --- | --- | --- |
| [S3-01](01-base-ui-spike-and-tailwind-sources/index.md) | `6wz1.3` | none | `crg7`, `ghe` | Base UI spike and app Tailwind sources |
| [S3-02](02-token-layers/index.md) | `6wz1.4` | S3-01 | `u4nq` | Fixed and tenant token layers |
| [S3-03](03-primitives-and-shared-parts/index.md) | `6wz1.5` | S3-02 | none | Primitives and shared parts, replacing the core kits |
| [S3-04a](04a-navigation-tree-and-migration/index.md) | `6wz1.6` | S3-03 | none | Section 3 migration, navigation tree and page stubs |
| [S3-04b](04b-shell-chromes-and-behaviors/index.md) | `6wz1.12` | S3-04a | `1ri3` | Shell chromes and behaviors |
| [S3-05](05-modules-and-categories-pages/index.md) | `6wz1.7` | S3-04b | `4xz` | Modules and Categories pages |
| [S3-06](06-tenant-settings-and-configform/index.md) | `6wz1.8` | S3-04b | none | Tenant Settings and ConfigForm |
| [S3-07](07-branding-page/index.md) | `6wz1.9` | S3-04b | none | Branding page |
| [S3-08](08-sign-in-emails-and-keycloak-pages/index.md) | `6wz1.10` | S3-02 | `6wz1.2` | Sign-in branding, email templates and Keycloak pages |
| [S3-09](09-section-3-acceptance/index.md) | `6wz1.11` | S3-05, S3-06, S3-07, S3-08 | none | Section 3 acceptance |

Item 7 (personal Preferences), settings search and reintroduction review are deferred by the 2026-10-22 revision. Record navigation and record categories moved to Section 4.

## Order

```mermaid
graph LR
  S1[S3-01 Base UI spike + Tailwind sources] --> S2[S3-02 Token layers]
  S2 --> S3[S3-03 Primitives]
  S2 --> S8[S3-08 Sign-in + emails + Keycloak pages]
  S3 --> S4a[S3-04a Migration + tree + stubs]
  S4a --> S4[S3-04b Shell chromes]
  S4 --> S5[S3-05 Modules + Categories]
  S4 --> S6[S3-06 Tenant Settings]
  S4 --> S7[S3-07 Branding page]
  S5 --> S9[S3-09 Acceptance]
  S6 --> S9
  S7 --> S9
  S8 --> S9
```

S3-01 to S3-04b run one after another. S3-08 can start after S3-02. S3-05, S3-06 and S3-07 can run in parallel after S3-04b. S3-04a lays the shared stubs they need, so that they do not collide (plan D3-6).

## Critique of 2026-10-22

A cold review (Traycer artifact `spec-3-tickets-critique`) found 16 findings. Fourteen were mechanical and are applied here and in the plan. They include moving AC-11b to S3-09, seeding data where a ticket needs a later page, one owner for the focus ring, the shared-file stubs in S3-04a, and corrected claims about the code. The two scope findings are the owner decisions above.
