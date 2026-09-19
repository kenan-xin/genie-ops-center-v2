# Design verification prototypes

Throwaway, development-only mockups. Not production code or approved replacement designs. State is in memory and resets on reload; all names and records are illustrative.

Open [Module and solution access](module-access.prototype.html) directly in a browser. It brings together the existing Modules → Roles handoff and solution Access → shared assignment form. It is intended to verify the permission model, not introduce a second assignment writer or a generic cross-module access screen into the product.

Superseded on 2026-09-18. The product owner asked for one central access screen, and the design tree now carries it. This prototype is kept as the record of the experiment that led there. Read the canonical designs below, not this file.

Canonical designs:

- [Access](../sections/access/spec.md): the one screen that writes a role assignment, and the read-only Overview of who reaches what.
- [Modules](../sections/audit-and-tenant-settings/spec.md): compiled-module enablement, access summary, Manage in Access.
- [Roles](../sections/people-groups-and-roles/spec.md): permission sets only. Assignments are read-only here and link to Access.
- [Solutions](../sections/solutions/spec.md): the per-solution Access tab, read-only, linking to Access.

The preview/effective-access inspector and guided scenarios in the prototype are review aids, not proposed product screens. The sample Service requests capability illustrates a customer module and defines no real customer workflow. Font fallbacks and native controls keep this single file self-contained; it does not replace the specified shadcn/Base UI implementation.
