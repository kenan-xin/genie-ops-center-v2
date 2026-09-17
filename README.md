# Genie Ops Center v2

Status: planning. No application code yet.

Genie Ops Center is an enterprise application platform: one repository, one Dockerfile, a shared core, and business modules. Every customer runs its own deployment from its own image, which carries core plus only that customer's modules, with one database and one identity realm, on Genie's servers or in the customer's own infrastructure.

Read in this order:

1. `docs/core/vision.md`: the platform, its decisions, and open questions.
2. `docs/core/roadmap.md`: core sections in dependency order, each with a definition of done.
3. `docs/core/tech-stack.md`: every runtime, library, and service, with the reason it is there.
4. `docs/architecture/data-shape.md`: the deployment tables, the core tables, and the rules module tables follow.
4a. `docs/architecture/module-contract.md`: every extension point a module may use, what core provides, and how the contract grows.
4b. `docs/architecture/repository-layout.md`: the monorepo tree, the per-customer configuration folders, and the eight levels at which a customer requirement is met.
5. `docs/modules/README.md`: the module catalogue, then the module you are working on.
6. `docs/architecture/diagrams/`: interactive diagrams of the deployment topology and the sign-in flow. Open the HTML files in a browser. The `.json` files beside them are the sources.

`docs/adr/` holds the architecture decision records: why one database per customer, why one Keycloak realm per customer, why modules live in one repository, why authorization lives in the application, how the database migrates on release, how Keycloak and Better Auth divide identity from session, and why every customer runs its own deployment from its own image.

`docs/README.md` maps every folder, including the ones that fill in later: design, specs, tickets, runbooks.
