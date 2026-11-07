# Technical plans

Bounded technical approaches supporting the numbered specifications. Specifications own requirements and acceptance criteria; ADRs and the core decision log own accepted decisions. Plans describe sequencing, integration boundaries, verification and stop conditions, not implementation tickets or proof of completion.

| Plan | Status |
| --- | --- |
| [Spec 0: Monorepo foundation](00-monorepo-foundation.md) | Approved for ticket breakdown, 2026-09-19; all tickets integrated and accepted 2026-09-23; G5 registry push done 2026-09-24; epic 1rd closed |
| [Spec 1: Deployment and setup](01-deployment-and-setup.md) | Approved for implementation 2026-09-24; all tickets under epic 1ia implemented and the epic closed |
| [Spec 2: Identity and access](02-identity-and-access.md) | Drafted 2026-09-27 and reviewed; tickets under epic d8l5 implemented; S2-G3 passes 2026-10-06 except the AC-14 operator confirmation and the first green scheduled Entra run (owner beads d8l5.23, d8l5.24); amended 2026-11-03 for the access model of 2026-11-02 with D2-6, D2-7, step 7 and gate S2-G4; Access tickets S2-18 to S2-25 open |
| [Spec 3: Shell, branding and design system](03-shell-branding-and-design-system.md) | Drafted 2026-10-22 after the breakdown approval; all tickets under epic 6wz1 integrated into local develop 2026-10-24; S3-G3 passes; the anti-slop scan of every story on 2026-10-26 found no `tiny-text` finding, so the text-size exception is closed, and the edge and overlay findings are known skips in bead `6wz1.17`; not pushed |
| [Spec 7: Invoice and payments](07-invoice-and-payments.md) | Drafted 2026-10-27, critiqued twice; spec and tickets under epic czjw approved 2026-10-27; S7-01 to S7-13 integrated into `develop` and pushed by 2026-11-01; S7-14 and S7-15 closed after the owner signed off the dry run on 2026-11-03; the wave 4 review added the follow-up tickets S7-16 to S7-39 on 2026-11-03, open, in the order P2-1 to P2-8; the wave 5 section and the tickets S7-40 to S7-47 drafted on 2026-11-08, waiting for owner approval |

Module naming amendment: [propagation and implemented-ticket rework](module-naming-revision.md), 2026-09-20. Naming is approved, and the rework is implemented and integrated at `19bdf39` (bead `ygn`, closed 2026-09-22).
