# packages/core/src/lib/password

The shared password rule of R-64 and the one generator a provisioning path uses (R-57).

## What belongs here

The pure rule the client meter and the server check both read: at least 14 characters, three of the
four character classes (lower case, upper case, digit, symbol), and the password is not the account
email. `generatePassword` builds a value that meets it, used by the `break_glass` setup step. The
fourth R-64 clause (not the provisioning password) is a save-time comparison a caller makes; it is
not part of a pure predicate over one value.

## What must not go here

Database access, Better Auth, and the save-time comparison itself. The rule has no dependency but
`node:crypto`, so the client meter can share it without reaching the server tree.

## What it imports

`node:crypto` only.
