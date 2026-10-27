# Modules

A module is a business capability that plugs into the core through the module contract. The core ships one platform module to every tenant. Every other module is built for one customer and offered to others by entitlement. Modules are documented here, one folder each, and never in the core documents.

| Module | Kind | Status | Folder |
| --- | --- | --- | --- |
| Solutions | Platform module, every tenant | Core roadmap Section 4 | `solutions/` |
| Approvals | Customer module, first customer, with the agreement register (contracts merged in on 2026-10-20, ADR 0012) | Deferred on customer discovery | `approvals/` |
| Invoices and Payments | Capability module | Roadmap Section 7 | `invoices-and-payments/` |
| Slides | Capability module | Roadmap Section 7 | `slides/` |
| Analytics | Capability module | Roadmap Section 7, on the dataset seam of `DEC-54` | `analytics/` |

## Planned modules

A planned module has no folder until its specification starts. These notes record the intent and the constraints that are already known.

Slides: a person chats with an agent to create and edit a presentation, applies the deployment's branding, presents it, and exports it to PowerPoint. A deck is a structured document of slides and typed elements, never a raw HTML string, so that the PowerPoint export keeps the layout. The agent edits a deck through checked patch operations that refuse an edit made on an outdated version. Brand colors and fonts come from the tenant branding. Exported files are saved through `FileStorage`.

Analytics: a person builds their own dashboards of panels, filters, and charts, by chat or by hand. A panel reads a named dataset that a module publishes, never free SQL, so every number passes `can()` and `scopesFor()` for that person and no module reads another module's tables. Each dataset carries a description for the agent: what it measures, its fields, and its caveats. Section 7 builds the dataset seam (`DEC-54`) and the module.

Both modules use the core agent runtime of `DEC-29` and know no other module. Research on an open-source example of both, with what can be reused, is kept with the planning notes and not in this repository.

## What a module folder holds

`README.md` is required and holds: who the module is for, the problem, the phases with a definition of done each, the permission keys and default roles, the tables, the open decisions (`OPEN-n`, ids local to the module), and the deferred markers. `discovery.md` holds the questions only the customer can answer (`D-n`, ids local to the module) and the answers as they arrive. A module may add a design folder and a spec folder when it reaches that stage.

## The module contract

The full list of what a module declares and what core provides is `../architecture/module-contract.md`. In one line: a module exports an id, schema, router, permission keys, record types, default roles, navigation, pages, a configuration schema, events, jobs, optional inbound endpoints and integration kinds, and tests. The app's module registry mounts a module for a tenant only when `tenant_module` holds an entitlement, and seeds its default roles when the entitlement is enabled. A module imports `packages/core` and `packages/ui` and never another module. When a module needs something the contract lacks, the contract is extended in core once.

## Writing rules

The rules in `../README.md` apply: no customer names, no reference to the previous codebase, identity provider rather than a vendor name. Name a module by its capability, never by its customer.
