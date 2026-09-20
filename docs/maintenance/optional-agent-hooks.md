# Optional agent hooks

The repository tracks hook configuration for two coding agents: `.claude/settings.json` with the helper scripts in `.claude/helpers/`, and `.codex/hooks.json`. These hooks call personal tools that the repository does not require. The tools are `@nanonets/graft` (a code search index) and `impeccable` (a user interface review script). No build step, test, or runtime path depends on either tool.

The rule for these files is simple. A hook finds its tool through the environment or through the normal search path, never through a path that only exists on one computer. If the tool is absent, the hook exits without an error.

## How each hook finds its tool

| Hook | Tool | Discovery order |
| --- | --- | --- |
| `.claude/helpers/graft-hooks.cjs`, `.claude/helpers/graft-statusline.cjs` | `@nanonets/graft` | `GRAFT_CLAUDE_DIR`, then the project `node_modules`, then the Node installation, then `npm root -g` |
| `.codex/hooks.json` PostToolUse and Stop | `impeccable` | `IMPECCABLE_BIN`, then `impeccable` on `PATH` |

`GRAFT_CLAUDE_DIR` is the `dist/claude` directory inside an installed copy of `@nanonets/graft`. `IMPECCABLE_BIN` is the full path of the `impeccable` executable. Set either variable only if the tool is installed outside the normal search path.

Two rules decide what a configured value means.

1. A configured directory or file that exists wins over every later step, whatever version it holds. Version ranking decides only between the copies that discovery finds.
2. A configured value that does not exist is ignored. `GRAFT_CLAUDE_DIR` then falls back to discovery. `IMPECCABLE_BIN` runs nothing at all, on Windows and on every other system, because a person who names a path asked for that one tool.

The Beads hooks in `.codex/hooks.json` call `bd`, which the repository workflow requires. Those hooks stay as they are.

## Check the hooks

Run the check from the repository root:

```bash
node .claude/helpers/hooks.test.cjs
```

The check builds a temporary directory with a stub tool. It proves that a configured tool runs, that a tool on `PATH` runs, that a missing tool exits without output, that a stale configured value runs nothing, and that a configured graft directory beats a higher-versioned installed copy. It activates no hook of this checkout.

The check runs no `cmd.exe`, so the Windows command of `.codex/hooks.json` is read rather than executed. The check asserts that the command tests `IMPECCABLE_BIN` with `if exist` before it calls the value. Windows behavior itself remains unverified.

## Rules for a new hook

1. Do not write a home directory path or a version manager path into a tracked hook.
2. Give the hook one environment variable for an unusual installation, and document the variable here.
3. Make sure that the hook exits with status 0 when the tool is absent.
4. Add the new case to `.claude/helpers/hooks.test.cjs`.
