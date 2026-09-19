# Design

Delivered by the design owner: the fixed token layer, the shell, one design per core roadmap section in `../core/roadmap.md`, and one design per module phase in `../modules/<module>/README.md`. Each design is reviewed against its section or phase before implementation.

What belongs here: what only the design owner can decide. That is the token layer, the shell, each screen's layout, states, and copy, and the sample data that renders them. What the product is, what it stores, and what a module may do lives in `../core/`, `../architecture/`, and `../modules/`. A design file cites those files. It never restates them. A limit, a status list, or a column has one home, and a design file names that home.

Naming: a `user` row is shown as "person" in every screen. The product is "Genie Ops Center", never bare "Genie".

Sample values: `blue-600` is the default value of the shadcn `--primary` variable that each tenant's Branding fills per request. The sample colors in this tree are reference values of the fixed layer, not brand choices; creative identity is the tenant's contribution, and the fixed layer carries none.

Standing check: a field in a `types.ts` that has no column in `../architecture/data-shape.md` and no row in `../architecture/module-contract.md` is a finding. The design raises it in its handover report and does not invent the column.

Ownership: the design authoring workspace is `/home/kenan/work/genie-ops-center-design`; this tree is the imported reference used by the v2 repository. Each section folder holds its specification, `types.ts`, `data.json`, and captures; `reference/` holds screen components as visual evidence (see `reference/README.md`); `design-system/tokens.md` and `shell/spec.md` hold the imported token layer and shell. Importing a design does not approve changes to platform behavior, data shape, module contracts or roadmap scope. Conflicts require explicit reconciliation with the canonical platform decisions and specifications. The [2026-09-19 import record](imports/2026-09-19.md) records provenance, known stale captures and review status. A capture is one historical state, not proof of current behavior; do not choose authority merely by file modification time. Inspect current source and its governing contract, and report disagreements rather than silently promoting screenshots or prototype callbacks into requirements.

Design rounds and the core section each one serves. The rounds carry no numbering of their own.

| Design round | Serves |
| --- | --- |
| `sections/sign-in-and-tenant-pages` | Section 1 (not-set-up page) and Section 2 (sign-in, break-glass sign-in) |
| `sections/account-and-inbox` | Section 2 (account page, sessions) and Section 3 (idle timeout, shell empty state, personal overrides). The inbox screen is a later capability, Section 5 item 8. |
| `sections/people-groups-and-roles` | Section 2 |
| `sections/access` | Section 2. Grants writes every role assignment, Overview reads who reaches what. The amendments this round needs are in `amendments-access-2026-09-18.md` |
| `sections/branding` | Section 3 |
| `sections/audit-and-tenant-settings` | Section 2 item 12 (audit reader) and Section 3 (Tenant settings, Modules, Categories) |
| `sections/email-templates` | Section 3 |
| `sections/solutions` | Section 4 |
| `shell` | Section 3 |
| `design-system/tokens.md` | Section 3 |

`history/` holds the review and handover records of past rounds. Each starts with a line that says it is a record and not current. `research/` holds the evidence a decision cites.
