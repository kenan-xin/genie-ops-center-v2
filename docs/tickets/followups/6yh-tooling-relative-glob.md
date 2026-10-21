# Tooling relative glob controls

Ticket `genie-ops-center-v2-6yh`, source baseline `20536f0`, 2026-09-21.
Two cases exercise the raw relative-specifier matcher independently of the
`tools/generators` path spelling. One rejects `../generators/index.ts` from core;
one permits `../lib/index.ts` from a nested core file. These lint fixtures test
specifier matching, not filesystem module resolution.

Focused command from packages/config:

```sh
pnpm exec vitest run --config vitest.config.ts src/oxlint/boundaries.test.ts -t 'the tooling relative-path glob'
```

Removing the sole `**/../generators/**` entry makes the rejection case fail.
Broadening that entry to `**/../**` makes the legitimate-climb case fail.
Restoring the boundary source makes both pass. Each mutant exits1 with an
assertion failure; the restored run exits0. The source bytes were restored in
a finally block. Production configuration is unchanged.
