import type { RequestPrincipal } from "../../services/authorization/principal.ts";
import { MAX_PINNED_ENTRIES, type Module } from "../module-contract/module.ts";
import type {
  CategoryReader,
  EntitlementReader,
  NavigationCategory,
} from "../tenant-context/readers.ts";
import { CORE_ADMIN_NAVIGATION } from "./core-admin.ts";
import {
  CORE_NAVIGATION_ID,
  landingRoute,
  type PermittedEntry,
  permittedNavigation,
} from "./index.ts";

export type NavigationCategoryGroup = {
  readonly id: string;
  readonly name: string;
  readonly entries: readonly PermittedEntry[];
};

/** `id` is a CoreAdminGroupId or a module id. */
export type AdminNavigationGroup = {
  readonly id: string;
  readonly entries: readonly PermittedEntry[];
};

export type NavigationTree = {
  readonly pinned: readonly PermittedEntry[];
  readonly workspace: readonly PermittedEntry[];
  readonly categories: readonly NavigationCategoryGroup[];
  readonly admin: readonly AdminNavigationGroup[];
  readonly landing: string | undefined;
};

/**
 * Arranges the already permitted entries into the shell's blocks (R-28, R-29, R-29a, R-91). It
 * filters nothing by permission: `permittedNavigation` is the one `can()` pass, and `landingRoute`
 * the one landing resolver (R-30). A category comes from the module's placement, never an entry.
 */
export function buildNavigationTree(input: {
  readonly modules: readonly Module[];
  readonly permitted: readonly PermittedEntry[];
  readonly categories: readonly NavigationCategory[];
  readonly categoryOf: ReadonlyMap<string, string | null>;
}): NavigationTree {
  const listed = new Set(input.categories.map((category) => category.id));

  // Registry order, then declared order.
  const ofModules = (surface: PermittedEntry["surface"]) =>
    input.modules.map((module) => ({
      module,
      entries: input.permitted.filter(
        (entry) =>
          entry.moduleId === module.identity.id && entry.surface === surface
      ),
    }));

  const workspaceEntries = ofModules("workspace").flatMap(
    ({ entries }) => entries
  );

  // A placement that names no listed category counts as none (R-91).
  const byCategory = Map.groupBy(workspaceEntries, (entry) => {
    const id = input.categoryOf.get(entry.moduleId);

    return id != null && listed.has(id) ? id : undefined;
  });

  const categories = input.categories.flatMap((category) => {
    const entries = (byCategory.get(category.id) ?? []).toSorted(
      (left, right) =>
        left.label.localeCompare(right.label) || left.id.localeCompare(right.id)
    );

    return entries.length === 0
      ? []
      : [{ id: category.id, name: category.name, entries }];
  });

  const pinned = input.modules
    .flatMap((module) =>
      module.navigation.pinned.flatMap(
        (pin) =>
          workspaceEntries.find(
            (entry) =>
              entry.moduleId === module.identity.id && entry.id === pin.id
          ) ?? []
      )
    )
    .slice(0, MAX_PINNED_ENTRIES);

  const coreGroups = CORE_ADMIN_NAVIGATION.map((group) => ({
    id: group.id,
    entries: group.entries.flatMap(
      (declared) =>
        input.permitted.find(
          (entry) =>
            entry.moduleId === CORE_NAVIGATION_ID && entry.id === declared.id
        ) ?? []
    ),
  }));

  const moduleGroups = ofModules("admin").map(({ module, entries }) => ({
    id: module.identity.id,
    entries,
  }));

  return {
    pinned,
    workspace: byCategory.get(undefined) ?? [],
    categories,
    admin: [...coreGroups, ...moduleGroups].filter(
      (group) => group.entries.length > 0
    ),
    landing: landingRoute(input.permitted),
  };
}

/** The signed-in person's navigation tree: one permission pass, then the pure arrangement. */
export async function navigationTree(input: {
  readonly tenant: {
    readonly entitlements: EntitlementReader;
    readonly categories: CategoryReader;
  };
  readonly modules: readonly Module[];
  readonly caller: RequestPrincipal;
}): Promise<NavigationTree> {
  const [permitted, categories, placements] = await Promise.all([
    permittedNavigation({
      entitlements: input.tenant.entitlements,
      modules: input.modules,
      caller: input.caller,
      coreEntries: CORE_ADMIN_NAVIGATION.flatMap((group) => group.entries),
    }),
    input.tenant.categories.list(),
    Promise.all(
      input.modules.map(
        async (module) =>
          [
            module.identity.id,
            await input.tenant.categories.ofModule(module.identity.id),
          ] as const
      )
    ),
  ]);

  return buildNavigationTree({
    modules: input.modules,
    permitted,
    categories,
    categoryOf: new Map(placements),
  });
}
