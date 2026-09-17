# Design

Delivered by the design owner: the fixed token layer, the shell, one design per core roadmap section in `../core/roadmap.md`, and one design per module phase in `../modules/<module>/README.md`. Each design is reviewed against its section or phase before implementation.

What belongs here: what only the design owner can decide. That is the token layer, the shell, each screen's layout, states, and copy, and the sample data that renders them. What the product is, what it stores, and what a module may do lives in `../core/`, `../architecture/`, and `../modules/`. A design file cites those files. It never restates them. A limit, a status list, or a column has one home, and a design file names that home.

Naming: a `user` row is shown as "person" in every screen. The product is "Genie Ops Center", never bare "Genie".

Standing check: a field in a `types.ts` that has no column in `../architecture/data-shape.md` and no row in `../architecture/module-contract.md` is a finding. The design raises it in its handover report and does not invent the column.

Handover rule: on every handover the design owner copies the text of the design tree's `product/` folder into this folder: the section specifications, the `types.ts` files, the `data.json` files, `design-system/tokens.md`, and `shell/spec.md`. The captures stay in the design tree and are referenced by their path there, so a reviewer opens them where they live. The text is what drifts and what a `DEC-` change must be checked against, so a reviewer can do that check in one repository and one pull request. A decision in `../core/decision-log.md` that changes a screen names the files here on its `Design files affected` line, and the next handover carries the change.

Design rounds and the core section each one serves. The rounds carry no numbering of their own.

| Design round | Serves |
| --- | --- |
| `sections/sign-in-and-tenant-pages` | Section 1 (not-set-up page) and Section 2 (sign-in, break-glass sign-in) |
| `sections/account-and-inbox` | Section 2 (account page, sessions) and Section 3 (idle timeout, shell empty state, personal overrides). The inbox screen is a later capability, Section 5 item 8. |
| `sections/people-groups-and-roles` | Section 2 |
| `sections/branding` | Section 3 |
| `sections/audit-and-tenant-settings` | Section 2 item 12 (audit reader) and Section 3 (Tenant settings, Modules, Categories) |
| `sections/email-templates` | Section 3 |
| `sections/solutions` | Section 4 |
| `shell` | Section 3 |
| `design-system/tokens.md` | Section 3 |

`history/` holds the review and handover records of past rounds. Each starts with a line that says it is a record and not current. `research/` holds the evidence a decision cites.
