# Isolated fixture root prefix proof

Follow-up: `genie-ops-center-v2-1rd.1.1`, 2026-09-21.

The helper exports the root prefix that cleanup checks use. Earlier coverage
could miss a different literal at the creation call because both observed
root lists were empty. A new test observes the actual subprocess working
directory through a disposable executable on PATH, checks that directory
against the exported prefix, and confirms the helper removed it.

The executable only prints its working directory. It does not run a linter
or change an anchor. Production lint behavior remains covered by the existing
boundary suite. The test restores PATH and removes its observed temporary
root even if an assertion fails. No production interface changed.

Mutation: replacing only the mkdtemp call argument with `oxlint-untracked-`
failed the prefix assertion (1 failed, 23 skipped). Restoring the helper was
byte-identical, SHA256
`ff0945b00bea750ff79922046360b2c1bc14288c76962670c3e23c7f999e1bcb`.
The focused mutation ran from packages/config with its vitest.config.ts;
an initial repository-root command found no tests and is not mutation evidence.

The PATH fixture uses a POSIX executable/shebang, tested on Linux. This is not
Windows execution evidence. No repository hook was activated.
