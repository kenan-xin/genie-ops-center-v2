import {
  permissionKeyFor,
  type ResourceRef,
} from "../../lib/module-contract/keys.ts";
import type { Module } from "../../lib/module-contract/module.ts";
import { can } from "./index.ts";
import type { RequestPrincipal } from "./principal.ts";

/** What a caller may learn about one record: nothing live unless they may open it (R-69). */
export type ReadableRecord = {
  readonly label: string;
  readonly exists: boolean;
  readonly path: string | null;
};

type RecordModule = Pick<Module, "identity" | "recordTypes">;

/** The map key of one record. */
export function recordKey(target: ResourceRef): string {
  return `${target.type}\u0000${target.id}`;
}

/** The module that declares one record type, or undefined when none does. */
function moduleForRecordType(
  modules: readonly RecordModule[],
  type: string
): RecordModule | undefined {
  return modules.find((module) =>
    module.recordTypes.some((recordType) => recordType.type === type)
  );
}

/** A record the caller may not open: no live label, no existence flag, no path (R-69). */
const HIDDEN_TARGET: ReadableRecord = { label: "", exists: false, path: null };

/**
 * Resolves each distinct record once, through the principal's own record resolver, and keeps the
 * live label, existence and path only when the caller may open the record under `can()` on the
 * path's declared permission (defaulting to the owning module's `<id>:use`). Core's people, groups
 * and roles resolve through the same resolver and name their own manage key. A record the caller
 * may not open is returned exactly like a record that no longer resolves: only the stored type and
 * id remain, so a caller entitled to an event or a grant but not the record learns nothing live
 * (R-69).
 *
 * The resolution goes through `caller.recordOf`, the same memo `can()` reads for parents, so the
 * owning module's resolver runs at most once for one record per request.
 */
export async function readableRecords(
  caller: RequestPrincipal,
  modules: readonly RecordModule[],
  targets: readonly ResourceRef[]
): Promise<ReadonlyMap<string, ReadableRecord>> {
  const resolved = new Map<string, ReadableRecord>();

  for (const target of targets) {
    const key = recordKey(target);

    if (resolved.has(key)) continue;

    // oxlint-disable-next-line no-await-in-loop -- one target at a time; the principal memoises each.
    const descriptor = await caller.recordOf({
      type: target.type,
      id: target.id,
    });

    const module = moduleForRecordType(modules, target.type);

    // Core's own record types always name their permission; a module's default to `<id>:use`.
    const permission =
      descriptor?.permission ??
      (module === undefined
        ? undefined
        : permissionKeyFor(module.identity.id, "use"));

    if (descriptor === undefined || permission === undefined) {
      resolved.set(key, HIDDEN_TARGET);
      continue;
    }

    // oxlint-disable-next-line no-await-in-loop -- the check belongs to this target's resolution.
    const allowed = await can(caller, permission, {
      type: target.type,
      id: target.id,
    });

    if (!allowed) {
      resolved.set(key, HIDDEN_TARGET);
      continue;
    }

    resolved.set(key, {
      label: descriptor.label,
      exists: true,
      path: descriptor.path ?? null,
    });
  }

  return resolved;
}
