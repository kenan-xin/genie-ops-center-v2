import { userInfo } from "node:os";
import { parseArgs } from "node:util";

import {
  type EnvironmentSource,
  validateEnvironment,
} from "../../lib/environment/index.ts";
import type { Module } from "../../lib/module-contract/module.ts";
import {
  type TenantContext,
  createTenantContext,
} from "../../lib/tenant-context/index.ts";
import { causeChain } from "../../utils/error-cause.ts";
import { writeAuditEvent } from "../audit/index.ts";
import { createLogger, redact } from "../logging/index.ts";
import {
  type MigrationHistory,
  type MigrationLog,
  migrationPlan,
  runMigrations,
} from "../migrator/index.ts";
import { setModuleEnabled } from "../module-management/index.ts";
import { runRetire } from "../retirement/index.ts";
import { runSetup } from "../setup/index.ts";

/**
 * What one `genie-ops` run reads and writes. The source is the process environment, the modules
 * are the ones the image compiled, the histories are the module histories only, and the two
 * sinks are the command's own stdout and stderr.
 */
export type GenieOpsOptions = {
  /** The environment the tenant context is built from, validated before anything connects. */
  readonly source: EnvironmentSource;
  /**
   * The modules the image compiled. The runner derives the ids from these once and passes that
   * one list to the context, the migrator run and the module commands, so nothing holds a second
   * copy and the readers cannot disagree (D-12).
   */
  readonly compiledModules: readonly Module[];
  /** The module histories only; core's history is prepended by the run (R-25). */
  readonly histories: readonly MigrationHistory[];
  /** Where ordinary progress and the audit fallback go. */
  readonly output: (line: string) => void;
  /** Where a failing run's cause and a parse refusal go. */
  readonly errorOutput: (line: string) => void;
};

/** One parsed command: the action name, the arguments the audit row may carry (D-4), and the
 * command bound to the parsed option values. */
type ParsedCommand = {
  readonly name:
    | "migrate"
    | "setup"
    | "module-enable"
    | "module-disable"
    | "retire";
  readonly args: readonly string[];
  readonly run: (
    context: TenantContext,
    options: GenieOpsOptions
  ) => Promise<void>;
};

/**
 * The one generic refusal for every parse failure. It names the accepted commands and never
 * echoes the rejected value: `ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL` carries the value, and a
 * value can be a secret an operator pasted by mistake (D-4, R-66).
 */
const PARSE_REFUSAL =
  "genie-ops: unknown or invalid command. Usage: genie-ops migrate, genie-ops setup --tenant-config <path> --branding-seed <path>, genie-ops module enable|disable <module-id>, genie-ops retire [--confirm]";

/** `redact` answers the same string for a string, which is what every sink here writes. */
function safe(text: string): string {
  // SAFETY: a string in is a string out; the union return is `redact`'s json surface.
  return redact(text) as string;
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
 * Every failure — an unknown command, an unexpected positional, an unknown option, a missing
 * required option — becomes the one generic refusal, so no rejected value reaches the output.
 */
function parseCommand(
  command: string | undefined,
  rest: readonly string[],
  compiledModuleIds: readonly string[]
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

      return {
        name: "migrate",
        args: [],
        run: (context, options) =>
          runMigrate(context, options, compiledModuleIds),
      };
    }

    case "setup": {
      const { values } = parseArgs({
        args: [...rest],
        options: {
          "tenant-config": { type: "string" },
          "branding-seed": { type: "string" },
        },
        strict: true,
        allowPositionals: false,
      });

      const tenantConfig = values["tenant-config"];
      const brandingSeed = values["branding-seed"];

      if (tenantConfig === undefined || brandingSeed === undefined) {
        throw new Error("setup needs --tenant-config and --branding-seed");
      }

      return {
        name: "setup",
        args: [tenantConfig, brandingSeed],
        run: (context, options) =>
          runSetup(
            context,
            { tenantConfig, brandingSeed },
            {
              compiledModuleIds,
              histories: options.histories,
              output: options.output,
              errorOutput: options.errorOutput,
            },
            commandLog(options)
          ),
      };
    }

    case "module": {
      // `enable|disable <module-id>` takes exactly two positionals and no options. Strict mode
      // rejects an unknown option; the length and value checks reject anything else, and every
      // failure is the one generic refusal, so the rejected value never reaches the output.
      const { positionals } = parseArgs({
        args: [...rest],
        options: {},
        strict: true,
        allowPositionals: true,
      });

      const [subcommand, moduleId, ...extra] = positionals;

      if (
        moduleId === undefined ||
        extra.length > 0 ||
        (subcommand !== "enable" && subcommand !== "disable")
      ) {
        throw new Error("unknown module subcommand");
      }

      const enabled = subcommand === "enable";

      return {
        name: enabled ? "module-enable" : "module-disable",
        args: [moduleId],
        run: async (context, options) => {
          await setModuleEnabled(
            context,
            options.compiledModules,
            moduleId,
            enabled
          );
        },
      };
    }

    case "retire": {
      const { values } = parseArgs({
        args: [...rest],
        options: { confirm: { type: "boolean" } },
        strict: true,
        allowPositionals: false,
      });

      const confirm = values.confirm === true;

      return {
        name: "retire",
        args: confirm ? ["--confirm"] : [],
        run: (context, options) => runRetire(context, confirm, options.output),
      };
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
  options: GenieOpsOptions,
  compiledModuleIds: readonly string[]
): Promise<void> {
  await runMigrations({
    env: context.env,
    pool: context.db.$client,
    histories: migrationPlan(options.histories),
    compiledModuleIds,
    log: commandLog(options),
  });
}

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

  // D-12: the one caller-supplied module list, derived once here and passed unchanged to the
  // context, the migrator run and the module commands, so nothing can hold a second copy.
  const compiledModuleIds = options.compiledModules.map(
    (module) => module.identity.id
  );

  let parsed: ParsedCommand;

  try {
    parsed = parseCommand(command, rest, compiledModuleIds);
  } catch {
    // D-4: no context, no audit row, and never the rejected value.
    options.errorOutput(PARSE_REFUSAL);

    return 1;
  }

  let context: TenantContext;

  try {
    // Validate before the logger exists and before anything connects (R-25). The factory
    // validates again internally; this first pass is what gives the logger its level and keeps
    // an invalid `LOG_LEVEL` from reaching pino as a crash.
    const env = validateEnvironment(options.source);

    context = createTenantContext(
      options.source,
      createLogger(env),
      compiledModuleIds,
      "genie-ops"
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

    await parsed.run(context, options);

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
