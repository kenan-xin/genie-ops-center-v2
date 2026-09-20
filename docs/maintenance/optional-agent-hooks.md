# Optional agent hooks

The repository tracks hook configuration for two coding agents: `.claude/settings.json` with the helper scripts in `.claude/helpers/`, and `.codex/hooks.json`. These hooks call personal tools that the repository does not require. The tools are `@nanonets/graft` (a code search index) and `impeccable` (a user interface review script). No build step, test, or runtime path depends on either tool.

The rule for these files is simple. A hook finds its tool through the environment or through the normal search path, never through a path that only exists on one computer. If the tool is absent, the hook exits without an error.

## How each hook finds its tool

| Hook | Tool | Discovery order |
| --- | --- | --- |
| `.claude/helpers/graft-hooks.cjs`, `.claude/helpers/graft-statusline.cjs` | `@nanonets/graft` | `GRAFT_CLAUDE_DIR`, then the project `node_modules`, then the Node installation, then `npm root -g` |
| `.codex/hooks.json` PostToolUse and Stop | `impeccable` | `IMPECCABLE_BIN`, then `impeccable` on `PATH` |

`GRAFT_CLAUDE_DIR` is the `dist/claude` directory inside an installed copy of `@nanonets/graft`. `IMPECCABLE_BIN` is the full path of the `impeccable` executable. Set either variable only if the tool is installed outside the normal search path.

The Beads hooks in `.codex/hooks.json` call `bd`, which the repository workflow requires. Those hooks stay as they are.

## Check the hooks

Run the check from the repository root:

```bash
node .claude/helpers/hooks.test.cjs
```

The check builds a temporary directory with a stub tool. It proves that a configured tool runs, that a tool on `PATH` runs, and that a missing tool exits without output. It activates no hook of this checkout.

## Rules for a new hook

1. Do not write a home directory path or a version manager path into a tracked hook.
2. Give the hook one environment variable for an unusual installation, and document the variable here.
3. Make sure that the hook exits with status 0 when the tool is absent.
4. Add the new case to `.claude/helpers/hooks.test.cjs`.
