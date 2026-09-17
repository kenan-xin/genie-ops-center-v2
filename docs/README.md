# Documentation

The core product and the modules are documented apart. Read `core/` first, then `architecture/`, then the module you are working on under `modules/`.

| Folder | Holds | Status |
| --- | --- | --- |
| `core/` | `vision.md`, `roadmap.md`, `tech-stack.md`, `decision-log.md`. The platform every tenant gets: tenancy, identity, access, branding, audit, storage, shell, and the module contract. The decision log keeps questions answered by default, with what is built now and what waits. No module content. | Draft for review |
| `modules/` | One folder per module: `README.md` (users, problem, phases, permissions, tables, open decisions) and `discovery.md` (customer questions, `D-n`). The solutions module also carries `chat-proxy.md` and `external-chat-api-contract.md`. `modules/README.md` is the catalogue. | Solutions defined; contracts and approvals deferred on discovery |
| `architecture/` | `access-model.md` (how sign-in, the groups claim, the group-to-role mapping, and local groups work, in prose), `data-shape.md` (deployment tables, core tables, and the rules module tables follow), `module-contract.md` (every extension point a module may use and how the contract grows), `repository-layout.md` (the monorepo tree and the eight levels at which a customer requirement is met), `environment-contract.md` (every environment variable the image reads, with defaults and rules), and `diagrams/` (interactive HTML with JSON sources). | Draft for review |
| `adr/` | Architecture decision records, numbered. Each records one hard-to-reverse decision, the options considered, and why. Read these before proposing to change a foundation choice. | Seven accepted; 0001, 0003, and 0005 superseded in part by 0007 |
| `design/` | Design tokens, the shell, and one design per core roadmap section or module phase, delivered by the design owner. | Empty, awaiting design owner |
| `specs/` | One specification per core roadmap section or module phase, written before implementation and approved before tickets. | Empty |
| `tickets/` | Ticket breakdowns per specification, with dependencies. | Empty |
| `runbooks/` | Operator procedures: the deployment guide (`deployment.md`), Keycloak realm and identity provider setup, upgrades, backup verification. | Deployment guide written |

Rules for every document in this tree:

1. Do not name customers. Write "the first customer" or "a customer". Name a module by its capability, never by its customer.
2. Do not reference the previous codebase. Describe the product as it will be.
3. Core documents describe the platform only. Anything specific to one module goes in that module's folder.
4. Platform-level unsettled points are `OPEN-n` in `core/vision.md`; module-level ones are `OPEN-n` in the module's `README.md`. Questions only a customer can answer are `D-n` in the module's `discovery.md`, and any path that depends on one is marked `DEFERRED (D-n)`.
5. Keep diagrams as JSON sources beside their HTML, and regenerate the HTML rather than editing it.
