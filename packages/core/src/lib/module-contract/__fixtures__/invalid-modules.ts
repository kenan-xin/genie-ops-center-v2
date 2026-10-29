import { permissionKeyFor } from "../keys.ts";
import { moduleLedgerTable } from "../ledger.ts";
import type { Module, ModulePage, NavigationEntry } from "../module.ts";
import { fixtureApi } from "./valid-module.ts";

/**
 * Contract fixtures: these live beside the tests that use them and are never
 * exported from a public entry point. Each transforms the valid fixture toward
 * a specific broken rule, keeping every other point intact.
 */

function actionOf(key: string, oldId: string): string {
  return key.replace(`${oldId}:`, "");
}

/** The path with the old id's segment replaced by the new id. */
function renamePath(path: string, oldId: string, newId: string): string {
  return path
    .split("/")
    .map((segment) => (segment === oldId ? newId : segment))
    .join("/");
}

function renamePage(
  page: ModulePage,
  oldId: string,
  newId: string
): ModulePage {
  return {
    ...page,
    path: renamePath(page.path, oldId, newId),
    permission: permissionKeyFor(newId, actionOf(page.permission, oldId)),
  };
}

/** Rewrite the identity, the contract's paths, the router's gate, every permission-key prefix, every page and navigation path, and the ledger to a new module id. */
export function renameModule(module: Module, id: string): Module {
  const oldId = module.identity.id;

  return {
    ...module,
    identity: { ...module.identity, id },
    schema: { ...module.schema, migrationsTable: moduleLedgerTable(id) },
    ...fixtureApi(id),
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
    pages: {
      workspace: module.pages.workspace.map((page) =>
        renamePage(page, oldId, id)
      ),
      admin: module.pages.admin.map((page) => renamePage(page, oldId, id)),
    },
    defaultRoles: module.defaultRoles.map((role) => ({
      ...role,
      permissions: role.permissions.map((key) =>
        permissionKeyFor(id, actionOf(key, oldId))
      ),
    })),
    jobs: module.jobs.map((job) => ({
      ...job,
      name: `${id}.${job.name.slice(oldId.length + 1)}`,
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
 * Repoint every admin entry — and its pinned copy — at another module's admin
 * key, leaving this module's own `<id>:admin` declared. That makes the pinned
 * entry require a permission the module never grants, which DEC-23 forbids.
 */
export function withForeignAdminPermission(module: Module): Module {
  const foreign = permissionKeyFor("other", "admin");

  const repoint = (entry: NavigationEntry): NavigationEntry =>
    entry.surface === "admin"
      ? { ...entry, requiredPermission: foreign }
      : entry;

  return {
    ...module,
    navigation: {
      pinned: module.navigation.pinned.map(repoint),
      entries: module.navigation.entries.map(repoint),
    },
  };
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
    path: renamePath(entry.path, oldId, newId),
    requiredPermission: permissionKeyFor(
      newId,
      actionOf(entry.requiredPermission, oldId)
    ),
  };
}
