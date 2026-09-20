import type { ZodType } from "zod";

import { isPermissionKey } from "./keys.ts";
import type { Module, NavigationEntry } from "./module.ts";

/**
 * The module contract's own kebab-case rule: lower-case letters and digits in
 * hyphen-separated parts, starting with a letter (Spec 0 R-12,
 * `docs/architecture/module-contract.md` Identity row, bead
 * `genie-ops-center-v2-1rd.1.5`). `keys.ts` guards the same pattern for the
 * parts of a permission key; the id rule is the id's own.
 */
const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** The navigation contract caps the pinned rail at six entries. */
const MAX_PINNED = 6;

/**
 * The zod def members this validator reads beyond the public `type`
 * discriminant: wrappers carry the schema they wrap, arrays carry their
 * element. Zod 4 exposes `def` publicly but types it per schema class, so the
 * members after `type` have no shared nameable type.
 */
type ZodDefView = {
  readonly type: string;

  readonly innerType?: ZodType;

  readonly element?: ZodType;
};

/**
 * The five field kinds ConfigForm renders (DEC-28). Wrappers a settings form
 * legitimately uses — `.default()`, `.prefault()`, `.optional()`, `.catch()`,
 * `.readonly()` — are unwrapped first, so a default value does not hide the
 * underlying kind. Anything else, a date included, is a sixth kind.
 */
function fieldKind(schema: ZodType): string | undefined {
  // SAFETY: `def` is public on every zod 4 class, and every wrapper class
  // carries `innerType`, every array class `element`. Reading them through
  // this narrow view is the framework-contract exception R-5a allows, in
  // place of one cast per schema class.
  const def = schema.def as ZodDefView;

  switch (def.type) {
    case "string":
      return "string";

    case "number":
    case "int":
      return "number";

    case "boolean":
      return "boolean";

    case "enum":
      return "enum";

    case "array": {
      const element = def.element;

      if (element === undefined) return undefined;

      return fieldKind(element) === "string" ? "stringList" : undefined;
    }

    case "default":
    case "prefault":
    case "optional":
    case "catch":
    case "readonly": {
      const inner = def.innerType;

      return inner === undefined ? undefined : fieldKind(inner);
    }

    default:
      return undefined;
  }
}

/**
 * Check one module declaration against the rules the `Module` type cannot
 * express, and return every problem found. A list, not a throw, so one test
 * can enumerate every failure in a fixture and one report can show them all.
 */
export function validateModule(module: Module): readonly string[] {
  const problems: string[] = [];
  const id = module.identity.id;

  if (!KEBAB_CASE.test(id)) {
    problems.push(`Module id "${id}" is not kebab-case.`);
  }

  for (const entry of module.permissions) {
    if (!isPermissionKey(entry.key) || !entry.key.startsWith(`${id}:`)) {
      problems.push(`Permission key "${entry.key}" is not "${id}:<action>".`);
    }
  }

  const declared = new Set(module.permissions.map((entry) => entry.key));

  const workspace = module.navigation.entries.filter(
    (entry) => entry.surface === "workspace"
  );

  const admin = module.navigation.entries.filter(
    (entry) => entry.surface === "admin"
  );

  if (workspace.length > 0 && !declared.has(`${id}:use`)) {
    problems.push(
      `A module with a workspace entry declares "${id}:use" (DEC-50).`
    );
  }

  for (const entry of workspace) {
    if (entry.requiredPermission !== `${id}:use`) {
      problems.push(
        `Workspace entry "${entry.id}" must require "${id}:use" (DEC-50).`
      );
    }
  }

  if (admin.length > 0 && !declared.has(`${id}:admin`)) {
    problems.push(
      `A module with an admin page declares "${id}:admin" (DEC-23).`
    );
  }

  // The landing entry is where a signed-in person arrives (DEC-49), so an admin
  // landing route would send everyone to a page gated on `<id>:admin`.
  for (const entry of admin) {
    if (entry.landing === true) {
      problems.push(
        `Admin entry "${entry.id}" carries the landing flag. Only a workspace entry may (DEC-49).`
      );
    }
  }

  // Seeding a default role creates missing permission definitions, never a
  // privilege in another module (docs/architecture/permission-evolution.md).
  for (const role of module.defaultRoles) {
    for (const key of role.permissions) {
      if (!declared.has(key)) {
        problems.push(
          `Default role "${role.name}" grants "${key}", which this module does not declare.`
        );
      }
    }
  }

  if (module.navigation.pinned.length > MAX_PINNED) {
    problems.push(
      `The pinned list holds ${module.navigation.pinned.length} entries. The maximum is six.`
    );
  }

  // The rail pins entries the module declares. A pinned id core cannot find
  // among the entries renders nothing, and a second copy of one takes a slot
  // from the six (module contract, Navigation row).
  const byId = new Map(
    module.navigation.entries.map((entry) => [entry.id, entry])
  );

  const pinnedIds = new Set<string>();

  for (const entry of module.navigation.pinned) {
    const entryOfThatId = byId.get(entry.id);

    if (entryOfThatId === undefined) {
      problems.push(
        `Pinned entry "${entry.id}" is not one of the module's navigation entries.`
      );
    } else if (!sameEntry(entryOfThatId, entry)) {
      problems.push(
        `Pinned entry "${entry.id}" differs from the navigation entry of that id.`
      );
    }

    if (pinnedIds.has(entry.id)) {
      problems.push(`Entry "${entry.id}" is pinned twice.`);
    }

    pinnedIds.add(entry.id);
  }

  // DEC-50: a module with a workspace entry seeds one role named after its
  // display name, and that role is what carries `<id>:use` to a person.
  if (workspace.length > 0) {
    const expected = `${module.identity.displayName} user`;
    const role = module.defaultRoles.find((entry) => entry.name === expected);

    if (role === undefined) {
      problems.push(
        `A module with a workspace entry seeds a default role named "${expected}" (DEC-50).`
      );
    } else if (!role.permissions.includes(`${id}:use`)) {
      problems.push(
        `Default role "${expected}" must carry "${id}:use" (DEC-50).`
      );
    }
  }

  if (landingCount(module) > 1) {
    problems.push(`Module "${id}" flags more than one landing route (DEC-49).`);
  }

  const configuration = module.configuration;

  if (configuration !== undefined) {
    const additional = configuration.section.additionalPermission;

    if (additional !== undefined && !isPermissionKey(additional)) {
      problems.push(
        `The additional permission "${additional}" is not a module key.`
      );
    }

    for (const [name, field] of Object.entries(configuration.schema.shape)) {
      if (fieldKind(field) === undefined) {
        problems.push(
          `Field "${name}" uses a field kind ConfigForm does not render. The five kinds are string, number, boolean, enum and string list (DEC-28).`
        );
      }
    }
  }

  return problems;
}

/** The checks that span a whole selected registry. */
export function validateRegistry(
  modules: readonly Module[]
): readonly string[] {
  const problems = modules.flatMap((module) => validateModule(module));
  const seen = new Set<string>();

  for (const module of modules) {
    if (seen.has(module.identity.id)) {
      problems.push(
        `Module id "${module.identity.id}" appears twice in the registry.`
      );
    }

    seen.add(module.identity.id);
  }

  const landing = modules.flatMap((module) =>
    module.navigation.entries.filter((entry) => entry.landing === true)
  );

  if (landing.length > 1) {
    problems.push(
      `${landing.length} modules flag a landing route. At most one does (DEC-49).`
    );
  }

  return problems;
}

/** Every field of the navigation contract, so a pinned copy cannot drift. */
function sameEntry(left: NavigationEntry, right: NavigationEntry): boolean {
  return (
    left.label === right.label &&
    left.path === right.path &&
    left.surface === right.surface &&
    left.requiredPermission === right.requiredPermission &&
    left.categoryId === right.categoryId &&
    left.landing === right.landing
  );
}

function landingCount(module: Module): number {
  return module.navigation.entries.filter((entry) => entry.landing === true)
    .length;
}
