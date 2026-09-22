# src/tenant-new

The rendering half of `nx g @genie/generators:tenant <slug>`: the seven files of a customer's
`deploy/` folder, produced as text (R-31).

## What belongs here

The file templates, the two objects that `tenant.yaml` and `branding.seed.json`
hold, and the guard that refuses an invalid slug. `renderTenant` returns a map from
repository-relative path to file content and writes nothing, so a caller chooses
the destination and a test reads the result without a filesystem.

## What must not go here

A copy of a core schema. The strict schemas for `tenant.yaml` and
`branding.seed.json` belong to `packages/core/src/lib/tenant-config/`, and this
folder takes them as a parameter instead of restating what a customer may write. A
secret, a hosting mode, a branding default, or a derived branding column: the
contract in `docs/architecture/branding-seed.md` makes omission the mechanism, so
the generator seeds the four required values and leaves every other column out. A
filesystem write, a deployment environment read, or a database connection.

## What it imports

The Node standard library and its own files.
