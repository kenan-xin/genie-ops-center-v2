import type { ZodType } from "zod";

import {
  AUDITOR_ROLE,
  TENANT_ADMINISTRATOR_ROLE,
} from "../../services/authorization/roles.ts";
import { moduleIdOfRouter } from "../entitlement/module-trpc.ts";
import { isPermissionKey } from "./keys.ts";
import { moduleLedgerTable } from "./ledger.ts";
import type {
  Module,
  NavigationEntry,
  PermissionTransformation,
} from "./module.ts";

/** Core's own system roles, which no module transformation may rename to or from. */
const CORE_SYSTEM_ROLES: ReadonlySet<string> = new Set([
  TENANT_ADMINISTRATOR_ROLE,
  AUDITOR_ROLE,
]);

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

  // `core` names core's own permission keys, system roles and transformation ledger (R-33c).
  if (id === "core") {
    problems.push(`Module id "core" is reserved for core.`);
  }

  // The startup omission check finds an installed module by its ledger table, so
  // the table must be the one this id derives (Spec 1 R-9/R-79, DEC-50).
  const expectedLedger = moduleLedgerTable(id);

  if (module.schema.migrationsTable !== expectedLedger) {
    problems.push(
      `Module "${id}" declares migrations table "${module.schema.migrationsTable}". A module ledger is "${expectedLedger}" (DEC-50).`
    );
  }

  problems.push(...routerProblems(module));

  for (const entry of module.permissions) {
    if (!isPermissionKey(entry.key) || !entry.key.startsWith(`${id}:`)) {
      problems.push(`Permission key "${entry.key}" is not "${id}:<action>".`);
    }
  }

  // The worker gates a job on the entitlement of the module whose prefix it carries, and core
  // owns `core.` for its own queues such as the heartbeat, so a job name outside the module's
  // prefix would run under another module's entitlement or race a core queue (D-11).
  const jobNames = new Set<string>();

  for (const { name } of module.jobs) {
    if (name.startsWith("core.")) {
      problems.push(
        `Module "${id}" cannot declare a job in the reserved "core." namespace: "${name}".`
      );
    } else if (!name.startsWith(`${id}.`)) {
      problems.push(`Job name "${name}" must start with "${id}.".`);
    }

    if (jobNames.has(name)) {
      problems.push(`Job name "${name}" is declared more than once.`);
    }

    jobNames.add(name);
  }

  // An event's version is its payload contract: an integer above zero, on the declarations and on
  // every subscription, so one name and version always means one shape (R-59).
  for (const event of module.events) {
    if (event.name.trim() === "") {
      problems.push(`Module "${id}" declares an event with no name.`);
    }

    if (!Number.isInteger(event.version) || event.version < 1) {
      problems.push(
        `Event "${event.name}" has version ${event.version}. A version is an integer above zero.`
      );
    }
  }

  // A durable or serialized subscription's queue is named from its `name`, never from the
  // declaration index, so a deploy that reorders same-mode subscriptions keeps every in-flight
  // job on its own handler. The name is therefore required on a durable subscription and unique
  // within the module (R-56).
  const durableNames = new Set<string>();

  for (const subscription of module.subscriptions ?? []) {
    if (subscription.event.name.trim() === "") {
      problems.push(`Module "${id}" subscribes to an event with no name.`);
    }

    if (
      !Number.isInteger(subscription.event.version) ||
      subscription.event.version < 1
    ) {
      problems.push(
        `Subscription to "${subscription.event.name}" has version ${subscription.event.version}. A version is an integer above zero.`
      );
    }

    // serializeBy is durable delivery: `durable: true` beside it is redundant but true, while
    // `durable: false` contradicts it (R-53, R-56).
    if (
      subscription.durable === false &&
      subscription.serializeBy !== undefined
    ) {
      problems.push(
        `Subscription to "${subscription.event.name}" sets serializeBy with durable false. serializeBy delivers durably.`
      );
    }

    // The name is a queue name segment joined with dots, so a dot or a character pg-boss refuses
    // would collide with another queue or fail at `createQueue` on the first emit (R-56).
    if (
      subscription.name !== undefined &&
      subscription.name.trim() !== "" &&
      !KEBAB_CASE.test(subscription.name)
    ) {
      problems.push(
        `Subscription name "${subscription.name}" is not kebab-case.`
      );
    }

    const durable =
      subscription.durable === true || subscription.serializeBy !== undefined;

    if (durable) {
      const name = subscription.name;

      if (name === undefined || name.trim() === "") {
        problems.push(
          `Durable subscription to "${subscription.event.name}" needs a name. Its queue is named from the name, not the declaration index (R-56).`
        );
      } else if (durableNames.has(name)) {
        problems.push(
          `Subscription name "${name}" is declared more than once in module "${id}".`
        );
      } else {
        durableNames.add(name);
      }
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

  // An admin entry is reached through a generic route that pins the permission
  // to this module's own key, so an entry naming another module's key would
  // gate its page on a grant this module never issued (DEC-23).
  for (const entry of admin) {
    if (entry.requiredPermission !== `${id}:admin`) {
      problems.push(
        `Admin entry "${entry.id}" must require "${id}:admin" (DEC-23).`
      );
    }
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

  // R-33c: a module transforms only its own keys, and each transformation id is its ledger entry.
  const transformationIds = new Set<string>();

  for (const transformation of module.permissionTransformations ?? []) {
    if (transformationIds.has(transformation.id)) {
      problems.push(
        `Permission transformation "${transformation.id}" is declared twice.`
      );
    }

    transformationIds.add(transformation.id);

    problems.push(...transformationProblems(module, transformation));
  }

  return problems;
}

/**
 * One transformation's ownership rules (R-33a, R-33c). Every key is one of the module's own
 * `<id>:<action>` keys. A rename is equivalent, never a merge: the old key is no longer declared
 * and the new one is, so no holder of one key gains another key the module still declares. A role
 * rename never names a core system role.
 */
function transformationProblems(
  module: Module,
  transformation: PermissionTransformation
): string[] {
  const id = module.identity.id;
  const { change } = transformation;
  const label = `Permission transformation "${transformation.id}"`;

  if (change.kind === "rename-role") {
    return [change.from, change.to].flatMap((name) =>
      CORE_SYSTEM_ROLES.has(name)
        ? [`${label} renames the core system role "${name}".`]
        : []
    );
  }

  const keys =
    change.kind === "rename" ? [change.from, change.to] : [change.key];

  const problems = keys.flatMap((key) =>
    isPermissionKey(key) && key.startsWith(`${id}:`)
      ? []
      : [`${label} changes "${key}", which is not a key of "${id}".`]
  );

  if (change.kind === "rename") {
    const declared = new Set(module.permissions.map((entry) => entry.key));

    if (declared.has(change.from)) {
      problems.push(
        `${label} renames "${change.from}", which the module still declares; a rename must not merge two keys.`
      );
    }

    if (!declared.has(change.to)) {
      problems.push(
        `${label} renames to "${change.to}", which the module does not declare.`
      );
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

/**
 * The per-procedure entitlement gate reads the id passed to `createModuleTRPC`, so a router built
 * elsewhere is ungated and one built for another id is gated on the wrong entitlement (d1y).
 * Lint bans a static `initTRPC` import in a module, but a dynamic `import("@trpc/server")`
 * cannot be linted; this check covers it, because a router core did not record is refused.
 */
function routerProblems(module: Module): readonly string[] {
  const id = module.identity.id;
  const owner = moduleIdOfRouter(module.router);

  if (owner === undefined) {
    return [
      `Module "${id}" has a router not built by createModuleTRPC("${id}").`,
    ];
  }

  if (owner !== id) {
    return [
      `Module "${id}" has a router built by createModuleTRPC("${owner}"). It must use "${id}".`,
    ];
  }

  return [];
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
