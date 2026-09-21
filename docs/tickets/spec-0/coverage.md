# Spec 0 requirement and acceptance ownership

Scope authority is [Spec 0](../../specs/00-monorepo-foundation.md), not this routing map. All owners are tickets in the [index](README.md). Rows assign obligations, not live status or completion proof. The [2026-09-21 audit](audit-2026-09-21.md) separates accepted work from remaining implementation and evidence.

## Requirements

| Requirements | Primary owner | Integration/completion owner |
| --- | --- | --- |
| R-1, R-2, R-3, R-4, R-5, R-5a, R-5b, R-6, R-7, R-7a, R-8, R-10 | S0-01 | S0-02 Storybook; S0-06 affected/cache; S0-11 CI |
| R-3a | S0-01 resolver; S0-06 app/cache | S0-10 Storybook; S0-11 images |
| R-9 | S0-01 initial checks | Each owner supplies READMEs; S0-08 generated; S0-09 completion; S0-11 CI |
| R-11, R-12, R-15a, R-15b, R-16, R-56 | S0-03 types/validation | S0-04 placeholder; S0-05 runtime CSP; S0-08 generated; S0-10 exclusion |
| R-13, R-14 | S0-03 lazy stub | S0-04 router; S0-05 per-request app/page context; per-job execution remains Section 1 |
| R-15 | S0-04 server module | S0-02 presentation; S0-05 real pages/main path |
| R-17, R-18 | S0-04 factory/runtime | S0-03 public types; S0-05 actual context reuse |
| R-19, R-19a, R-19b, R-20 | S0-05 built-image G2 | S0-04 runtime validation; S0-07 isolation enforcement; S0-11 CI |
| R-21, R-22, R-23, R-23a | S0-05 initial generation/composition | S0-06 full selection/matrix; S0-11 customer smoke |
| R-24, R-25, R-25a, R-26, R-26a, R-27, R-28 | S0-04 final migrator | S0-05 startup; S0-07 adversarial G3 |
| R-29, R-30, R-31 | S0-08 generators | S0-03 strict schemas; S0-10 story auto-discovery |
| R-32, R-33, R-35, R-36, R-36a | S0-05 minimal final image/app path | S0-11 image matrix; worker/CLI remain Section 1 |
| R-34 | S0-11 customer build/smoke/publish wrapper | S0-12 separately authorized real publish evidence |
| R-37 | S0-01 shared unit preset | Each package owner supplies tests; S0-11 nonempty CI |
| R-38, R-39 | S0-04 generic helpers and module factories | S0-05 app isolation; S0-07 concurrency; S0-08 generated factories |
| R-40 | S0-05 phone/desktop compose-backed E2E | S0-08 generated denial; S0-11 CI |
| R-41 | S0-01 repository check | S0-08 generated tests; S0-11 enforcement |
| R-41a, R-41c, R-41e | S0-02 G1 | S0-10 scoped completion; S0-11 CI/image exclusion |
| R-41b | S0-10 | S0-06 shared cache semantics; S0-11 image exclusion |
| R-41d | S0-02 first stories | Every UI owner; S0-08 generator; S0-09 agent pointers |
| R-42, R-43 | S0-09 | S0-05 initial app messages; S0-11 production exclusion |
| R-44, R-45 | S0-04 logger | S0-05 real request correlation |
| R-46 | S0-05 transport adapters | S0-04 shared catalogue/redaction |
| R-47, R-48, R-48a, R-49, R-49a, R-50 | S0-05 G2 headers/browser | S0-03 serializer/provider types; S0-11 customer paths |
| R-51, R-52, R-53, R-54, R-55 | S0-11 | S0-06 per-selection typecheck; S0-12 full evidence |

## Acceptance criteria

| Criterion | Primary proof owner | Final integration |
| --- | --- | --- |
| AC-1 | S0-01 / S0-06 | S0-11 / S0-12 |
| AC-2, AC-2a | S0-01 | S0-03 schemas / S0-08 generated destination / S0-12 |
| AC-3 | S0-03 contract / S0-04 router | S0-05 / S0-12 |
| AC-4 | S0-05 two-context | S0-07 no-skip / S0-11 CI / S0-12 |
| AC-5 | S0-06 | S0-11 / S0-12 |
| AC-6 | S0-04 / S0-07 | S0-12 |
| AC-7 | S0-08 | S0-10 story discovery / S0-12 |
| AC-8 | S0-11 | S0-12; real external push needs separate authority |
| AC-9 | S0-07 | S0-12 |
| AC-10 | S0-01 unit / S0-04 integration | S0-11 / S0-12 |
| AC-11 | S0-05 | S0-11 / S0-12 |
| AC-12, AC-13 | S0-09 | S0-11 image / S0-12 |
| AC-14 | S0-04 / S0-05 | S0-12 |
| AC-15 | S0-05 | S0-12 |
| AC-16 | S0-05 | S0-12 |
| AC-17, AC-18, AC-19 | S0-11 | S0-12; external release proof explicitly tracked |
| AC-20 | S0-03 / S0-04 / S0-05 | S0-08 conformance / S0-12 |
| AC-21, AC-22 | S0-11 | S0-12 |
| AC-23 | S0-03 / S0-05 / S0-08 | S0-12 |
| AC-24 | S0-06 | S0-11 image / S0-12 |
| AC-25, AC-26 | S0-05 | S0-12 recheck after integration |
| AC-27 | S0-02 G1 / S0-08 generation / S0-10 completion | S0-11 / S0-12 |
| AC-28 | S0-10 | S0-11 runtime exclusion / S0-12 |
| AC-29 | S0-03 / S0-08 | S0-06 registry / S0-10 Storybook exclusion / S0-12 |

No deferred Section 1 worker, deployment tables, entitlement readers, setup or lifecycle service is pulled forward to make an acceptance test easier. Generated modules prove denial under the unchanged stub; only placeholder proves authorized runtime success.


## Auxiliary acceptance ownership, audited 2026-09-21

| Bead | Owner and boundary |
| --- | --- |
| 5ph | Independent data-only entrypoint repair before S0-05; S0-06 consumes it |
| 2tc | S0-04 lane verifies Testcontainers/Postgres access; Docker info alone is insufficient |
| yt2 | S0-05 child: redacted viewer-provider failure logging with deny policy |
| 2cg | S0-10 child after S0-06: unset/empty identity and artifact-content proof |
| 3yv | First real Tailwind consumer in S0-05; G5 verifies consumption evidence |
| ygn | Remaining S0-08 generator naming proof; G5 verifies aggregate evidence |
| 2o4 | Separately authorized live checkout activation/proof, not an added G5 gate. G5 verifies canonical staged-hook behavior evidence; live activation is required only if explicitly added by the owner |
