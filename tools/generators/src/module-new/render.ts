import {
  moduleNamingError,
  modulePackageName,
} from "../workspace/module-naming.ts";
import { MODULE_TEMPLATES } from "./templates.ts";

/**
 * The shape of a module id: lower case, digits, single hyphens, starting with a
 * letter (module contract, Identity row, and Spec 0 R-12).
 *
 * This is an input guard on a command argument, not a second contract validator:
 * it stops the generator writing a folder no workspace check would accept. The
 * authoritative check over what already exists on disk stays
 * `moduleNamingError`, which this file also runs over its own output.
 */
const MODULE_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export type ModuleRenderInput = {
  readonly id: string;
  /** Defaults to the id in sentence case, for example `contract-data` to `Contract data`. */
  readonly displayName?: string;
};

/** Every spelling of the module's name the templates need, derived from the id alone. */
export type ModuleNames = {
  readonly id: string;
  readonly packageName: string;
  /** `contract-data` becomes `contractData`, the prefix of the exported declaration. */
  readonly camel: string;
  readonly pascal: string;
  /** `contract-data` becomes `contract_data`, for a SQL identifier. */
  readonly snake: string;
  readonly displayName: string;
  readonly table: string;
  readonly migrationsTable: string;
  readonly root: string;
};

function namesFor(input: ModuleRenderInput): ModuleNames {
  const camel = input.id.replace(/-([a-z0-9])/g, (_, char: string) =>
    char.toUpperCase()
  );

  const snake = input.id.replaceAll("-", "_");

  return {
    id: input.id,
    packageName: modulePackageName(input.id),
    camel,
    pascal: camel.charAt(0).toUpperCase() + camel.slice(1),
    snake,
    displayName:
      input.displayName ??
      input.id.charAt(0).toUpperCase() + input.id.slice(1).replaceAll("-", " "),
    table: `${snake}_record`,
    migrationsTable: `__drizzle_migrations_${snake}`,
    root: `packages/modules/${input.id}`,
  };
}

/**
 * Renders a module package as text, keyed by repository-relative path (R-30).
 *
 * It writes nothing and reads nothing: a caller decides where the bytes go, so the
 * same function serves the generator, a test and a dry run. The same id renders the
 * same bytes every time.
 *
 * The rendered package wires every point of the module contract, owns its own
 * migration history and ledger table, keeps `ctx.tenant` in every procedure
 * signature, and carries only its own permission keys, so the unchanged Section 0
 * stub refuses it.
 */
export function renderModule(
  input: ModuleRenderInput
): ReadonlyMap<string, string> {
  if (!MODULE_ID.test(input.id)) {
    throw new Error(
      `"${input.id}" is not a module id: an id is lower case, digits and single hyphens, and starts with a letter`
    );
  }

  const names = namesFor(input);

  // The generator renders the folder, the package name and the metadata id from
  // one id, so they agree by construction. Asking the shared invariant anyway
  // means a change to any one template that broke the rule fails here rather
  // than in the workspace hygiene suite of whoever ran the generator.
  const disagreement = moduleNamingError(input.id, names.packageName, input.id);

  if (disagreement !== undefined) {
    throw new Error(
      `the generator would write a package where ${disagreement}`
    );
  }

  return new Map(
    Object.entries(MODULE_TEMPLATES).map(([path, render]) => [
      `${names.root}/${path}`,
      render(names),
    ])
  );
}
