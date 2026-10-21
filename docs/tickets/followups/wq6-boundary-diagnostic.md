# UI app diagnostic assertions

Ticket `genie-ops-center-v2-wq6`, source baseline `9f67536`, 2026-09-21.
Four UI-to-app tests asserted only `ui imports no app`; they now assert the
complete sentence `ui imports no app.`. Production configuration is unchanged.

Mutation replaced only the configured message with `ui imports no app package.`.
With the original assertions all five tests selected by `-t "rejects ui"` passed.
With corrected assertions four failed and one passed. Restoring the configuration
made all five pass; the other 103 boundary tests were excluded from this focused
mutation run. The source was restored byte-identically in a finally block.

Focused command, run from packages/config:

```sh
pnpm exec vitest run --config vitest.config.ts src/oxlint/boundaries.test.ts -t 'rejects ui'
```

This checks the intended diagnostic sentence without asserting terminal framing
or unrelated lint output. It does not make diagnostics a public product API.
