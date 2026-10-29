import { z, type ZodType } from "zod";

import { moduleApiProblems } from "../rpc/conformance.ts";
import { isPermissionKey } from "./keys.ts";
import { moduleLedgerTable } from "./ledger.ts";
import {
  MAX_PINNED_ENTRIES,
  type Module,
  type NavigationEntry,
  type PermissionTransformation,
} from "./module.ts";
import { AUDITOR_ROLE, TENANT_ADMINISTRATOR_ROLE } from "./system-roles.ts";

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

/** Ids a module may not take: core itself, and the core areas (eight) beside the modules in the RPC router. */
const RESERVED_IDS: ReadonlySet<string> = new Set([
  "core",
  "audit",
  "groups",
  "people",
  "roles",
  "modules",
  "categories",
  "settings",
  "branding",
  // A `/<id>` page path must not claim a path that core or the module contract names, or a
  // disabled module's page would take that path in the proxy (Spec 1 R-8).
  "m",
  "admin",
  "api",
  "viewer",
  "account",
  "auth",
  "sign-in",
]);

const PAGE_LITERAL = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const PAGE_PARAMETER = /^:[a-z][a-zA-Z0-9]*$/;

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

  readonly options?: readonly ZodType[];

  readonly checks?: readonly {
    readonly _zod: {
      readonly def: { readonly check: string; readonly pattern?: RegExp };
    };
  }[];
};

/**
 * The JSON Schema keywords ConfigForm checks or reads (admin M-2). Any other keyword is a rule the
 * browser form lets through and the server refuses. `anyOf` is only the labeled enum of U-4.
 */
const FIELD_KEYWORDS: ReadonlySet<string> = new Set([
  "type",
  "enum",
  "default",
  "minLength",
  "maxLength",
  "pattern",
  "minimum",
  "maximum",
  "items",
  "maxItems",
  "title",
  "description",
  "anyOf",
]);

/** What ConfigForm checks on one entry of a string list. */
const ITEM_KEYWORDS: ReadonlySet<string> = new Set([
  "type",
  "maxLength",
  "pattern",
]);

/** One choice of a labeled enum: its value and its title (U-4). */
const CHOICE_KEYWORDS: ReadonlySet<string> = new Set([
  "type",
  "const",
  "title",
]);

const titledChoice = z.object({ const: z.string(), title: z.string() });

const jsonKeywords = z.record(z.string(), z.unknown());

/** One emitted field. A boolean `items` schema fails the parse, so the field is refused. */
const emittedField = z.looseObject({
  items: jsonKeywords.optional(),
  anyOf: z.array(jsonKeywords).optional(),
});

/** A whole number from 0. A missing value is not one: a JavaScript module can omit a typed field. */
function isWhole(value: number | undefined): boolean {
  return value !== undefined && Number.isInteger(value) && value >= 0;
}

function keysWithin(
  schema: z.infer<typeof jsonKeywords>,
  allowed: ReadonlySet<string>
): boolean {
  return Object.keys(schema).every((key) => allowed.has(key));
}

/** True when the field's JSON Schema holds only keywords ConfigForm checks (admin M-2). */
function formChecksKeywords(field: ZodType): boolean {
  const { $schema: _dialect, ...emitted } = z.toJSONSchema(field, {
    io: "input",
    unrepresentable: "throw",
  });

  const parsed = emittedField.safeParse(emitted);

  if (!parsed.success || !keysWithin(parsed.data, FIELD_KEYWORDS)) return false;

  const { items, anyOf } = parsed.data;

  if (items !== undefined && !keysWithin(items, ITEM_KEYWORDS)) return false;

  return (
    anyOf === undefined ||
    anyOf.every(
      (choice) =>
        keysWithin(choice, CHOICE_KEYWORDS) &&
        titledChoice.safeParse(choice).success
    )
  );
}

/**
 * True when the schema, or a schema it wraps, carries a rule JSON Schema cannot carry: a
 * refinement, or a pattern flag that `z.toJSONSchema` drops (admin M-2, DR-20 S3-06).
 */
function hiddenRule(schema: ZodType): boolean {
  // SAFETY: the same public `def` view `fieldKind` reads.
  const def = schema.def as ZodDefView;

  const ownRule = (def.checks ?? []).some(
    ({ _zod }) =>
      _zod.def.check === "custom" || (_zod.def.pattern?.flags ?? "") !== ""
  );

  const wrapped = [def.innerType, def.element, ...(def.options ?? [])].filter(
    (inner) => inner !== undefined
  );

  return ownRule || wrapped.some(hiddenRule);
}

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

    // A labeled enum: a union of string literals, each titled through `.meta()` (U-4).
    case "union":
      return def.options?.every(
        (option) =>
          option instanceof z.ZodLiteral &&
          option.values.size === 1 &&
          z.string().safeParse(option.value).success
      )
        ? "enum"
        : undefined;

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

  // `core` names core's own permission keys, system roles and transformation ledger (R-33c), and
  // core's areas own the other ids as their RPC keys and path prefixes (ADR 0011).
  if (RESERVED_IDS.has(id)) {
    problems.push(`Module id "${id}" is reserved for core.`);
  }

  // The startup omission check finds an installed module by its ledger table, so
  // the table must be the one this id derives (Spec 1 R-9/R-79, DEC-50).
  const expectedLedger = moduleLedgerTable(id);

  if (module.schema.migrationsTable !== expectedLedger) {
    problems.push(
      `Module "${id}" declares migrations table "${module.schema.migrationsTable}". A module ledger is "${expectedLedger}" (DEC-50).`
    );
  }

  problems.push(...moduleApiProblems(id, module.router, module.contract));

  for (const entry of module.permissions) {
    if (!isPermissionKey(entry.key) || !entry.key.startsWith(`${id}:`)) {
      problems.push(`Permission key "${entry.key}" is not "${id}:<action>".`);
    }
  }

  // The worker gates a job on the entitlement of the module whose prefix it carries, and core
  // owns `core.` for its own queues such as the heartbeat, so a job name outside the module's
  // prefix would run under another module's entitlement or race a core queue (D-11).
  const jobNames = new Set<string>();

  for (const { name, retry } of module.jobs) {
    // pg-boss refuses a queue whose retry values are not whole numbers from 0, and the worker
    // would then fail its start on every restart.
    if (
      retry !== undefined &&
      !(
        isWhole(retry.limit) &&
        (retry.delaySeconds === undefined || isWhole(retry.delaySeconds))
      )
    ) {
      problems.push(
        `Job "${name}" declares an invalid retry: a limit and a delay are whole numbers from 0.`
      );
    }

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

  // A dataset's name carries the module id, so two modules' datasets never collide in the one
  // registry (DEC-54). Its permission and record type are the module's own, so core checks a
  // key and resolves a record through the module that published it, and its time, key and
  // currency fields are the declared fields a generic query would otherwise trust blindly.
  const datasetNames = new Set<string>();
  const recordTypes = new Set(module.recordTypes.map((entry) => entry.type));

  for (const dataset of module.datasets ?? []) {
    const name = dataset.name;

    if (!name.startsWith(`${id}.`)) {
      problems.push(`Dataset name "${name}" must start with "${id}.".`);
    }

    if (!declared.has(dataset.permission)) {
      problems.push(
        `Dataset "${name}" names permission "${dataset.permission}", which the module does not declare.`
      );
    }

    if (dataset.fields[dataset.timeField]?.type !== "date") {
      problems.push(
        `Dataset "${name}" names time field "${dataset.timeField}", which is not a declared date field.`
      );
    }

    if (!recordTypes.has(dataset.recordKey.type)) {
      problems.push(
        `Dataset "${name}" names record type "${dataset.recordKey.type}", which is not one of the module's record types.`
      );
    }

    if (dataset.fields[dataset.recordKey.field]?.type !== "text") {
      problems.push(
        `Dataset "${name}" names record key field "${dataset.recordKey.field}", which is not a declared text field.`
      );
    }

    const holdsMoney = Object.values(dataset.fields).some(
      (field) => field.type === "money"
    );

    const currency =
      dataset.currencyField === undefined
        ? undefined
        : dataset.fields[dataset.currencyField];

    if (holdsMoney && currency?.type !== "text") {
      problems.push(
        `Dataset "${name}" holds a money field, so it must name a declared text currency field.`
      );
    }

    if (datasetNames.has(name)) {
      problems.push(`Dataset name "${name}" is declared more than once.`);
    }

    datasetNames.add(name);
  }

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

  problems.push(...pageProblems(module));

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

  if (module.navigation.pinned.length > MAX_PINNED_ENTRIES) {
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

    if (hiddenRule(configuration.schema)) {
      problems.push(
        `The configuration carries a refinement ConfigForm cannot check. Declare each rule on its field (DEC-28).`
      );
    }

    for (const [name, field] of Object.entries(configuration.schema.shape)) {
      if (fieldKind(field) === undefined) {
        problems.push(
          `Field "${name}" uses a field kind ConfigForm does not render. The five kinds are string, number, boolean, enum and string list (DEC-28).`
        );
      } else if (hiddenRule(field) || !formChecksKeywords(field)) {
        problems.push(
          `Field "${name}" uses a rule ConfigForm cannot check. The form checks length, a pattern with no flags, a range, a list size and titled choices, and nothing else (DEC-28).`
        );
      }
    }
  }

  // R-33c: a module transforms only its own keys, and each transformation id is its ledger entry.
  const transformationIds = new Set<string>();
  const transformations = module.permissionTransformations ?? [];

  for (const [index, transformation] of transformations.entries()) {
    if (transformationIds.has(transformation.id)) {
      problems.push(
        `Permission transformation "${transformation.id}" is declared twice.`
      );
    }

    transformationIds.add(transformation.id);

    problems.push(
      ...transformationProblems(
        module,
        transformation,
        transformations.slice(index + 1)
      )
    );
  }

  return problems;
}

/**
 * One transformation's ownership rules (R-33a, R-33c). Every key is one of the module's own
 * `<id>:<action>` keys. A rename is equivalent, never a merge. The list is permanent, so a rename
 * is judged as the start of its chain through the later renames in declaration order: the chain's
 * final key is declared, and no earlier key of the chain still is, so no holder of one key gains
 * another key the module still declares. A role rename never names a core system role.
 */
function transformationProblems(
  module: Module,
  transformation: PermissionTransformation,
  later: readonly PermissionTransformation[]
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
    const declared = new Set<string>(
      module.permissions.map((entry) => entry.key)
    );

    const chain: string[] = [change.from, change.to];

    for (const next of later) {
      if (next.change.kind === "rename" && next.change.from === chain.at(-1)) {
        chain.push(next.change.to);
      }
    }

    const final = chain.at(-1) ?? change.to;

    for (const key of chain.slice(0, -1)) {
      if (declared.has(key)) {
        problems.push(
          `${label} renames "${key}", which the module still declares; a rename must not merge two keys.`
        );
      }
    }

    if (!declared.has(final)) {
      problems.push(
        `${label} renames to "${final}", which the module does not declare.`
      );
    }
  }

  return problems;
}

/**
 * The page rules (Spec 7 R-1): each page lies in the module's own paths, has a well-formed path,
 * requires a key the module declares, names a record it can check, and matches no path another
 * page of its surface matches; every navigation entry has the page of its path and key.
 */
function pageProblems(module: Module): string[] {
  const id = module.identity.id;

  const declared = new Set<string>(
    module.permissions.map((entry) => entry.key)
  );

  const recordTypes = new Set(module.recordTypes.map((entry) => entry.type));

  const problems: string[] = [];

  const bases = {
    workspace: [`/${id}`, `/m/${id}`],
    admin: [`/admin/${id}`, `/admin/m/${id}`],
  };

  for (const surface of ["workspace", "admin"] as const) {
    const pageByPattern = new Map<string, string>();

    const entryPaths = new Set(
      module.navigation.entries
        .filter((entry) => entry.surface === surface)
        .map((entry) => entry.path)
    );

    for (const page of module.pages[surface]) {
      const { path, permission, record, parent } = page;

      // The trail links the parent with its entry's label, so a parent elsewhere would link nowhere.
      if (
        parent !== undefined &&
        (parent === path || !entryPaths.has(parent))
      ) {
        problems.push(
          `Page "${path}" names parent "${parent}", which is not the path of one of its ${surface} navigation entries.`
        );
      }

      if (
        !bases[surface].some(
          (base) => path === base || path.startsWith(`${base}/`)
        )
      ) {
        problems.push(
          `Page "${path}" is outside the module's own paths: "/${id}", "/m/${id}", "/admin/${id}" or "/admin/m/${id}".`
        );
      }

      const segments = path.split("/").slice(1);
      const names = segments.filter((segment) => PAGE_PARAMETER.test(segment));

      if (
        !segments.every(
          (segment) =>
            PAGE_LITERAL.test(segment) || PAGE_PARAMETER.test(segment)
        ) ||
        new Set(names).size !== names.length
      ) {
        problems.push(
          `Page path "${path}" must be "/"-separated kebab-case words or ":name" parameters, each name once.`
        );
      }

      if (!declared.has(permission)) {
        problems.push(
          `Page "${path}" requires "${permission}", which the module does not declare.`
        );
      }

      if (record !== undefined && !recordTypes.has(record.type)) {
        problems.push(
          `Page "${path}" names record type "${record.type}", which is not one of the module's record types.`
        );
      }

      if (record !== undefined && !names.includes(`:${record.param}`)) {
        problems.push(
          `Page "${path}" names record parameter "${record.param}", which its path does not hold.`
        );
      }

      // Two patterns match the same paths when they are equal once each parameter name is removed.
      const pattern = segments
        .map((segment) => (segment.startsWith(":") ? ":" : segment))
        .join("/");

      const earlier = pageByPattern.get(pattern);

      if (earlier === undefined) pageByPattern.set(pattern, path);
      else {
        problems.push(
          `Pages "${earlier}" and "${path}" of the ${surface} surface match the same paths.`
        );
      }
    }
  }

  for (const entry of module.navigation.entries) {
    const hasPage = module.pages[entry.surface].some(
      (page) =>
        page.path === entry.path && page.permission === entry.requiredPermission
    );

    if (!hasPage) {
      problems.push(
        `Navigation entry "${entry.id}" has no ${entry.surface} page at "${entry.path}" that requires "${entry.requiredPermission}".`
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

/** Every field of the navigation contract, so a pinned copy cannot drift. */
function sameEntry(left: NavigationEntry, right: NavigationEntry): boolean {
  return (
    left.label === right.label &&
    left.path === right.path &&
    left.surface === right.surface &&
    left.requiredPermission === right.requiredPermission &&
    left.landing === right.landing
  );
}

function landingCount(module: Module): number {
  return module.navigation.entries.filter((entry) => entry.landing === true)
    .length;
}
