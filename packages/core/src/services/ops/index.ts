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
   * The module ids the image compiled. The runner adds the histories it is about to apply, so
   * the one derived list reaches the context and the migrator run (D-12).
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

/** The migrator's event stream, adapted to the command's two sinks (R-10, R-45). */
function commandLog(options: GenieOpsOptions): MigrationLog {
  return (event) => {
    const line = `${event.event}${event.history === undefined ? "" : ` ${event.history}`}`;

    if (event.event === "migration-cleanup-failed") {
      options.errorOutput(safe(line));

      return;
    }

    options.output(safe(line));
  };
}

/** True for a ledger table name this process may quote into a statement. */
const LEDGER_TABLE = /^[A-Za-z0-9_-]+$/;

/**
 * The migrations one history still owes, read from its ledger. A ledger that does not exist yet
 * — a fresh database, or a module applied for the first time — has nothing recorded, so every
 * one of its migrations is pending. The count is only for the log line (R-10); the migrator
 * itself decides what to apply.
 */
async function appliedCount(
  context: TenantContext,
  table: string
): Promise<number> {
  if (!LEDGER_TABLE.test(table)) return 0;

  const present = await context.db.$client.query<{ present: boolean }>(
    "select to_regclass($1) is not null as present",
    [`drizzle."${table}"`]
  );

  if (present.rows[0]?.present !== true) return 0;

  const counted = await context.db.$client.query<{ count: number }>(
    `select count(*)::int as count from drizzle."${table}"`
  );

  return counted.rows[0]?.count ?? 0;
}

/** The pending migrations across every history, core first (R-10). */
async function pendingCount(
  context: TenantContext,
  histories: readonly MigrationHistory[]
): Promise<number> {
  const applied = await Promise.all(
    histories.map((history) => appliedCount(context, history.table))
  );

  return histories.reduce(
    (pending, history, index) =>
      pending + Math.max(0, history.migrations.length - (applied[index] ?? 0)),
    0
  );
}

/** Runs `migrate`: log the pending count, then the migrator run of R-9. */
async function runMigrate(
  context: TenantContext,
  options: GenieOpsOptions
): Promise<void> {
  const histories = migrationPlan(options.histories);
  const pending = await pendingCount(context, histories);

  options.output(safe(`pending ${pending} migration(s)`));

  await runMigrations({
    env: context.env,
    pool: context.db.$client,
    histories,
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

  // The run's compiled set is the image's compiled modules plus the histories it is about to
  // apply. In production the two are the same list — the histories are the compiled modules —
  // and the union keeps a history the run itself creates from being read as an installed module
  // the image omits (R-79). One list reaches both the context and the run, so no caller holds a
  // second copy (D-12).
  const compiledModuleIds = [
    ...new Set([
      ...options.compiledModuleIds,
      ...options.histories.map((history) => history.name),
    ]),
  ];

  let context: TenantContext;

  try {
    // Validate before the logger exists and before anything connects (R-25). The factory
    // validates again internally; this first pass is what gives the logger its level and keeps
    // an invalid `LOG_LEVEL` from reaching pino as a crash.
    const env = validateEnvironment(options.source);

    context = createTenantContext(
      options.source,
      createLogger(env),
      compiledModuleIds
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

  const metadata = { osUser: userInfo().username, args: parsed.args };

  try {
    await run(context, { ...options, compiledModuleIds });

    await writeAuditEvent(context, {
      action: `ops:${parsed.name}`,
      metadata: { ...metadata, outcome: "success" },
      output: options.output,
    });

    return 0;
  } catch (caught) {
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
