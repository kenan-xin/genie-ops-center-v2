# packages/core/src/services/administrators

The `genie-ops admin add <email>` command (Spec 2 R-59).

## What belongs here

The operator-facing administrator write: pre-add a person as a pending member of the local
`Genie Administrators` group, or add an existing person to it, in one transaction, with no email.
It is the recommended recovery path when the last administrator is gone (`DEC-23`).

## What must not go here

The setup `admin_seed` step (a setup step, in `services/setup/`), a second writer of the
administrator membership, and a permission check: the command runs on the host with no session.

## What it imports

The tenant context and the core schema's `user`, `group` and `group_member` tables, the
`Genie Administrators` group name, and the shared pre-add name helper.
