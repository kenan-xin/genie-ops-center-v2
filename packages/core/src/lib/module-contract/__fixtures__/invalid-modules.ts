import { permissionKeyFor } from "../keys.ts";
import type { Module, NavigationEntry } from "../module.ts";

/**
 * Contract fixtures: these live beside the tests that use them and are never
 * exported from a public entry point. Each transforms the valid fixture toward
 * a specific broken rule, keeping every other point intact.
 */

function actionOf(key: string, oldId: string): string {
  return key.replace(`${oldId}:`, "");
}

/** Rewrite the identity and every permission-key prefix to a new module id. */
export function renameModule(module: Module, id: string): Module {
  const oldId = module.identity.id;

  return {
    ...module,
    identity: { ...module.identity, id },
    permissions: module.permissions.map((entry) => ({
      ...entry,
      key: permissionKeyFor(id, actionOf(entry.key, oldId)),
    })),
    navigation: {
      ...module.navigation,
      pinned: module.navigation.pinned.map((entry) =>
        renameEntry(entry, oldId, id)
      ),
      entries: module.navigation.entries.map((entry) =>
        renameEntry(entry, oldId, id)
      ),
    },
    defaultRoles: module.defaultRoles.map((role) => ({
      ...role,
      permissions: role.permissions.map((key) =>
        permissionKeyFor(id, actionOf(key, oldId))
      ),
    })),
  };
}

/** Flag the first workspace entry as the landing route (DEC-49). */
export function withLanding(module: Module): Module {
  return withLandingOn(module, "workspace");
}

/** Flag the first admin entry as the landing route, which DEC-49 forbids. */
export function withAdminLanding(module: Module): Module {
  return withLandingOn(module, "admin");
}

/**
 * Flags one entry and its pinned copy together. The rail pins the entries a
 * module declares, so flagging only one of the two copies would break a second
 * rule and stop the transform from naming a single one.
 */
function withLandingOn(
  module: Module,
  surface: NavigationEntry["surface"]
): Module {
  const target = module.navigation.entries.find(
    (entry) => entry.surface === surface
  );

  if (target === undefined) {
    throw new Error(`fixture lost its ${surface} entry`);
  }

  const flag = (entry: NavigationEntry): NavigationEntry =>
    entry.id === target.id ? { ...entry, landing: true } : entry;

  return {
    ...module,
    navigation: {
      pinned: module.navigation.pinned.map(flag),
      entries: module.navigation.entries.map(flag),
    },
  };
}

function renameEntry(
  entry: NavigationEntry,
  oldId: string,
  newId: string
): NavigationEntry {
  return {
    ...entry,
    requiredPermission: permissionKeyFor(
      newId,
      actionOf(entry.requiredPermission, oldId)
    ),
  };
}
