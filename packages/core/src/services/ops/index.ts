import { userInfo } from "node:os";
import { parseArgs } from "node:util";

import {
  type EnvironmentSource,
  validateEnvironment,
} from "../../lib/environment/index.ts";
import {
  type TenantContext,
  createTenantContext,
} from "../../lib/tenant-context/index.ts";
import { writeAuditEvent } from "../audit/index.ts";
import { createLogger, redact } from "../logging/index.ts";
import {
  type MigrationHistory,
  type MigrationLog,
  migrationPlan,
  runMigrations,
} from "../migrator/index.ts";

/**
 * What one `genie-ops` run reads and writes. The source is the process environment, the module
 * ids are the ones the image compiled, the histories are the module histories only, and the two
 * sinks are the command's own stdout and stderr.
 */
export type GenieOpsOptions = {
  /** The environment the tenant context is built from, validated before anything connects. */
  readonly source: EnvironmentSource;
  /**
   * The module ids the image compiled, passed unchanged to the context and the migrator run, so
   * the two cannot disagree and no caller holds a second copy (D-12).
   */
  readonly compiledModuleIds: readonly string[];
  /** The module histories only; core's history is prepended by the run (R-25). */
  readonly histories: readonly MigrationHistory[];
  /** Where ordinary progress and the audit fallback go. */
  readonly output: (line: string) => void;
  /** Where a failing run's cause and a parse refusal go. */
  readonly errorOutput: (line: string) => void;
};

/** One parsed command: the action name and the arguments the audit row may carry (D-4). */
type ParsedCommand = {
  readonly name: keyof typeof COMMANDS;
  readonly args: readonly string[];
};

/**
 * The one generic refusal for every parse failure. It names the accepted commands and never
 * echoes the rejected value: `ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL` carries the value, and a
 * value can be a secret an operator pasted by mistake (D-4, R-66).
 */
const PARSE_REFUSAL =
  "genie-ops: unknown or invalid command. Usage: genie-ops migrate";

/** `redact` answers the same string for a string, which is what every sink here writes. */
function safe(text: string): string {
  // SAFETY: a string in is a string out; the union return is `redact`'s json surface.
  return redact(text) as string;
}

/**
 * The deepest message in an error's cause chain. A migration failure is an `AppError` whose
 * safe message says only that a migration did not finish; the operator's cause — the database's
 * own text — sits on the cause, and that is the line the runbook tells them to read (R-76).
 */
function causeChain(error: Error | undefined): string {
  const messages: string[] = [];
  const seen = new Set<Error>();

  let current = error;

  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    messages.push(current.message);

    const cause: unknown = current.cause;

    current = cause instanceof Error ? cause : undefined;
  }

  return messages.join(": ");
}

/**
 * The operating-system user the audit row records (R-64). A UID with no passwd entry — an
 * arbitrary `docker run --user <uid>`, which a customer-hosted deployment can use — makes
 * `userInfo()` throw, and that throw must not escape the audited path, or the run writes no row
 * and leaks its pool. The fallback names the numeric UID instead, so exactly one row is still
 * written. The lookup is a parameter so a test can drive the failure without mocking a module.
 */
export function osUserName(
  read: () => { username: string } = userInfo
): string {
  try {
    return read().username;
  } catch {
    const uid = process.getuid?.();

    return uid === undefined ? "uid:unknown" : `uid:${uid}`;
  }
}

/**
 * Parses one subcommand with node's own `parseArgs`, dispatching on the first positional (D-4).
 * Every failure — an unknown command, an unexpected positional, an unknown option — becomes the
 * one generic refusal, so no rejected value reaches the output.
 */
function parseCommand(
  command: string | undefined,
  rest: readonly string[]
): ParsedCommand {
  switch (command) {
    case "migrate": {
      // `migrate` takes no arguments in this section. Strict mode with positionals disallowed
      // rejects both an unexpected positional and an unknown option, and the refusal above is
      // what a caller sees for either.
      parseArgs({
        args: [...rest],
        options: {},
        strict: true,
        allowPositionals: false,
      });

      return { name: "migrate", args: [] };
    }

    default:
      throw new Error("unknown command");
  }
}

/**
 * The migrator's event stream, adapted to the command's two sinks (R-10, R-45). The pending
 * count reaches the operator as its own line; a cleanup failure keeps its cause, because this
 * log is the only place that cause reaches anyone (R-45).
 */
function commandLog(options: GenieOpsOptions): MigrationLog {
  return (event) => {
    if (event.event === "migration-cleanup-failed") {
      options.errorOutput(
        safe(
          `${event.event}: ${causeChain(event.error instanceof Error ? event.error : undefined)}`
        )
      );

      return;
    }

    if (event.event === "migration-pending") {
      options.output(safe(`migration-pending ${event.count ?? 0}`));

      return;
    }

    const line = `${event.event}${event.history === undefined ? "" : ` ${event.history}`}`;

    options.output(safe(line));
  };
}

/** Runs `migrate` through the migrator run of R-9, with the one compiled list (D-12). */
async function runMigrate(
  context: TenantContext,
  options: GenieOpsOptions
): Promise<void> {
  await runMigrations({
    env: context.env,
    pool: context.db.$client,
    histories: migrationPlan(options.histories),
    compiledModuleIds: options.compiledModuleIds,
    log: commandLog(options),
  });
}

/** The command by name, inferred so its keys are the accepted command names. */
const COMMANDS = {
  migrate: runMigrate,
} satisfies Readonly<
  Record<
    string,
    (context: TenantContext, options: GenieOpsOptions) => Promise<void>
  >
>;

/**
 * The one `genie-ops` runner (R-63). It parses the command with node's `parseArgs`, builds the
 * tenant context from the validated environment, runs the command and writes the one audit row
 * around it (R-64). A parse failure happens before the context exists, so it logs the generic
 * refusal and writes no row (D-4); a command that fails writes one row with a failing outcome
 * (R-65) and the run exits nonzero with the cause on the output (R-76).
 *
 * The command never builds its own connection: the runner owns the one context and closes its
 * pool when the run ends (DEC-34).
 */
export async function runGenieOps(
  argv: readonly string[],
  options: GenieOpsOptions
): Promise<number> {
  const [command, ...rest] = argv;

  let parsed: ParsedCommand;

  try {
    parsed = parseCommand(command, rest);
  } catch {
    // D-4: no context, no audit row, and never the rejected value.
    options.errorOutput(PARSE_REFUSAL);

    return 1;
  }

  const run = COMMANDS[parsed.name];

  let context: TenantContext;

  try {
    // Validate before the logger exists and before anything connects (R-25). The factory
    // validates again internally; this first pass is what gives the logger its level and keeps
    // an invalid `LOG_LEVEL` from reaching pino as a crash.
    const env = validateEnvironment(options.source);

    context = createTenantContext(
      options.source,
      createLogger(env),
      options.compiledModuleIds
    );
  } catch (caught) {
    // The environment is validated before anything connects, so a bad one is a refusal, not a
    // failed run: there is no context to audit through, so the cause reaches the output (R-25).
    options.errorOutput(
      safe(
        `genie-ops: ${causeChain(caught instanceof Error ? caught : undefined)}`
      )
    );

    return 1;
  }

  try {
    // The operating-system user is read inside the audited path, so a UID with no passwd entry
    // still leaves exactly one row (R-64).
    const metadata = { osUser: osUserName(), args: parsed.args };

    await run(context, options);

    await writeAuditEvent(context, {
      action: `ops:${parsed.name}`,
      metadata: { ...metadata, outcome: "success" },
      output: options.output,
    });

    return 0;
  } catch (caught) {
    const metadata = { osUser: osUserName(), args: parsed.args };

    options.errorOutput(
      safe(
        `genie-ops: ${causeChain(caught instanceof Error ? caught : undefined)}`
      )
    );

    await writeAuditEvent(context, {
      action: `ops:${parsed.name}`,
      metadata: { ...metadata, outcome: "failure" },
      output: options.output,
    });

    return 1;
  } finally {
    await context.db.$client.end();
  }
}
