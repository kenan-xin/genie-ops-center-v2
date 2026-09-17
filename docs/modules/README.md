# Modules

A module is a business capability that plugs into the core through the module contract. The core ships one platform module to every tenant. Every other module is built for one customer and offered to others by entitlement. Modules are documented here, one folder each, and never in the core documents.

| Module | Kind | Status | Folder |
| --- | --- | --- | --- |
| Solutions | Platform module, every tenant | Core roadmap Section 4 | `solutions/` |
| Contracts | Customer module, first customer | Deferred on customer discovery | `contracts/` |
| Approvals | Customer module, first customer | Deferred on customer discovery | `approvals/` |

## What a module folder holds

`README.md` is required and holds: who the module is for, the problem, the phases with a definition of done each, the permission keys and default roles, the tables, the open decisions (`OPEN-n`, ids local to the module), and the deferred markers. `discovery.md` holds the questions only the customer can answer (`D-n`, ids local to the module) and the answers as they arrive. A module may add a design folder and a spec folder when it reaches that stage.

## The module contract

The full list of what a module declares and what core provides is `../architecture/module-contract.md`. In one line: a module exports an id, schema, router, permission keys, record types, default roles, navigation, pages, a configuration schema, events, jobs, optional inbound endpoints and integration kinds, and tests. The app's module registry mounts a module for a tenant only when `tenant_module` holds an entitlement, and seeds its default roles when the entitlement is enabled. A module imports `packages/core` and `packages/ui` and never another module. When a module needs something the contract lacks, the contract is extended in core once.

## Writing rules

The rules in `../README.md` apply: no customer names, no reference to the previous codebase, identity provider rather than a vendor name. Name a module by its capability, never by its customer.
