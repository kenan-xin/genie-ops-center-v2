# Optional agent hooks

The repository tracks hook configuration for the Codex agent in `.codex/hooks.json`, with its check in `.claude/helpers/`. These hooks call a personal tool that the repository does not require: `impeccable`, a user interface review script. No build step, test, or runtime path depends on it.

The rule for these files is simple. A hook finds its tool through the environment or through the normal search path, never through a path that only exists on one computer. If the tool is absent, the hook exits without an error.

## How each hook finds its tool

| Hook | Tool | Discovery order |
| --- | --- | --- |
| `.codex/hooks.json` PostToolUse and Stop | `impeccable` | `IMPECCABLE_BIN`, then `impeccable` on `PATH` |

`IMPECCABLE_BIN` is the full path of the `impeccable` executable. Set it only if the tool is installed outside the normal search path.

Two rules decide what a configured value means.

1. A configured file that exists wins over `PATH`.
2. A configured value that does not exist runs nothing at all, on Windows and on every other system, because a person who names a path asked for that one tool.

The Beads hooks in `.codex/hooks.json` call `bd`, which the repository workflow requires. Those hooks stay as they are.

## Check the hooks

Run the check from the repository root:

```bash
node .claude/helpers/hooks.test.cjs
```

The check builds a temporary directory with a stub tool. It proves that a configured tool runs, that a tool on `PATH` runs, that a missing tool exits without output, and that a stale configured value runs nothing. It activates no hook of this checkout.

The check runs no `cmd.exe`, so the Windows command of `.codex/hooks.json` is read rather than executed. The check asserts that the command tests `IMPECCABLE_BIN` with `if exist` before it calls the value. Windows behavior itself remains unverified.

## Rules for a new hook

1. Do not write a home directory path or a version manager path into a tracked hook.
2. Give the hook one environment variable for an unusual installation, and document the variable here.
3. Make sure that the hook exits with status 0 when the tool is absent.
4. Add the new case to `.claude/helpers/hooks.test.cjs`.
