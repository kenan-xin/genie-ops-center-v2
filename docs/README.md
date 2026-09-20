# Documentation

Coding-agent entry point: [Spec 0 ticket map and execution rules](tickets/spec-0/README.md). Approved decisions, active execution authority and durable acceptance evidence must be available under `docs/` with repository-relative links. External chats or local coordinator storage are never required inputs.

The core product and the modules are documented apart. Read `core/` first, then `architecture/`, then the module you are working on under `modules/`.

| Folder | Holds | Status |
| --- | --- | --- |
| `flows/` | Business stories and cross-section core flows: actors, triggers, walkthroughs, outcomes, alternate paths, and links to owning requirements and tests. Module-specific flows remain under their module and are indexed here. | Module activation, permission-upgrade and removal/reintroduction scenarios captured; not implementation proof |
| `core/` | `vision.md`, `roadmap.md`, `tech-stack.md`, `decision-log.md`. The platform every tenant gets: tenancy, identity, access, branding, audit, storage, shell, and the module contract. The decision log keeps questions answered by default, with what is built now and what waits. No module content. | Draft for review |
| `modules/` | One folder per module: `README.md` (users, problem, phases, permissions, tables, open decisions) and `discovery.md` (customer questions, `D-n`). The solutions module also carries `chat-proxy.md` and `external-chat-api-contract.md`. `modules/README.md` is the catalogue. | Solutions defined; contracts and approvals deferred on discovery |
| `architecture/` | `access-model.md` (how sign-in, the groups claim, the group-to-role mapping, and local groups work, in prose), `data-shape.md` (deployment tables, core tables, and the rules module tables follow), `module-contract.md` (every extension point a module may use and how the contract grows), `repository-layout.md` (the monorepo tree and the eight levels at which a customer requirement is met), `environment-contract.md` (every environment variable the image reads, with defaults and rules), and `diagrams/` (interactive HTML with JSON sources). | Draft for review |
| `adr/` | Architecture decision records, numbered. Each records one hard-to-reverse decision, the options considered, and why. Read these before proposing to change a foundation choice. | Nine accepted; 0001, 0003, and 0005 superseded in part by 0007; 0008 records foundation integration and 0009 the Storybook/Vitest compatibility decision |
| `design/` | Design tokens, the shell, and one design per core roadmap section or module phase: specs, `types.ts`, `data.json`, and the captures beside each section. `design/reference/` holds the screen components as a visual reference. This repository is the only home of the design. `design/history/` holds past review records. | Seven section designs, shell, and tokens delivered and reconciled through `DEC-51` |
| `specs/` | One specification per core roadmap section or module phase, written before implementation and approved before tickets. `specs/SPEC_READINESS_REPORT.md` holds the evidence and findings of the specification round. | Spec 0 approved for delivery; Sections 1–5 remain draft requirements with accepted amendments |
| `tech-plans/` | Bounded technical approaches, verification gates and complexity stop conditions; decisions link back to ADRs and the core decision log. | Spec 0 approved; S0-01/S0-02 integrated, later gates remain separately evidenced |
| `tickets/` | Ticket breakdowns per specification, with dependencies. | Twelve Spec 0 tickets; scope in these documents, live claims/status in Beads |
| `runbooks/` | Operator procedures: the deployment guide (`deployment.md`), the Keycloak realm and identity provider runbook (`keycloak-realm.md`), the reverse proxy setup (`reverse-proxy.md`), upgrades, backup verification. | Deployment guide, realm runbook, and reverse proxy runbook written; the last two are planned procedures not yet run |

For initial branding requirements and defaults, read [Branding seed requirements](architecture/branding-seed.md), governed by DEC-35 in the [decision log](core/decision-log.md). Architectural decisions remain in `adr/`; unresolved product questions remain in `core/vision.md`.

For module lifecycle policy, read [Module removal and reintroduction](architecture/module-removal.md) and its linked business flows and required test matrix. Acceptance of the policy is not implementation proof.

For UI implementation and testing, read [Storybook and UI development](architecture/ui-development.md): story ownership, module-safe discovery, documentation, the test-first loop, and the boundary between component tests and E2E. Section 0 establishes this development infrastructure.

The [2026-09-21 reconciliation record](maintenance/2026-09-21-documentation-reconciliation.md) maps current decisions, accepted integration evidence and remaining open requirements. [Optional agent hooks](maintenance/optional-agent-hooks.md) states how the tracked agent hooks find personal tools that the repository does not require.

## Direction of authority

Product vision, roadmap and accepted decisions (the core decision log and ADRs) govern downstream specifications. Specifications follow those sources; upstream documents must not cite specifications, numbered R/AC clauses, technical plans or implementation tickets as their authority or navigation dependencies. Keep traceability in the downstream document, pointing back to the governing product decision. Architecture contracts elaborate accepted decisions; design owns presentation. Plans and tickets derive from those requirements, and test evidence establishes implementation status, never product intent. Historical review records retain their original references as history.

Rules for every document in this tree:

1. Do not name customers. Write "the first customer" or "a customer". Name a module by its capability, never by its customer.
2. Do not reference the previous codebase. Describe the product as it will be.
3. Core documents describe the platform only. Anything specific to one module goes in that module's folder.
4. Platform-level unsettled points are `OPEN-n` in `core/vision.md`; module-level ones are `OPEN-n` in the module's `README.md`. Questions only a customer can answer are `D-n` in the module's `discovery.md`, and any path that depends on one is marked `DEFERRED (D-n)`.
5. Keep diagrams as JSON sources beside their HTML, and regenerate the HTML rather than editing it.
