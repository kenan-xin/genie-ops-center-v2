import { existsSync } from "node:fs";
import { join } from "node:path";

import type { ModuleInventoryEntry } from "./inventory.ts";

/** Whether the caller supplied a selection at all. Unset and explicitly empty differ. */
export type SelectionSource = "unset" | "explicit";

export type ModuleSelection = {
  readonly source: SelectionSource;
  readonly ids: readonly string[];
  readonly entries: readonly ModuleInventoryEntry[];
};

export type ResolveInput = {
  /** The raw MODULE_INCLUDE value. undefined means unset. "" means explicitly empty. */
  readonly moduleInclude: string | undefined;
  readonly inventory: readonly ModuleInventoryEntry[];
  readonly workspaceRoot: string;
};

function parseIds(raw: string): readonly string[] {
  if (raw.trim() === "") {
    return [];
  }

  return raw.split(",").map((segment, index) => {
    const id = segment.trim();

    if (id === "") {
      throw new Error(
        `Empty module id at position ${index} in MODULE_INCLUDE: "${raw}"`
      );
    }

    return id;
  });
}

/**
 * Resolves an ordered module selection from a raw MODULE_INCLUDE value.
 * Reads the inventory as data. It never imports or evaluates a module entrypoint.
 */
export function resolveModuleSelection(input: ResolveInput): ModuleSelection {
  const byId = new Map(input.inventory.map((entry) => [entry.id, entry]));

  const source: SelectionSource =
    input.moduleInclude === undefined ? "unset" : "explicit";

  const ids =
    input.moduleInclude === undefined
      ? input.inventory.map((entry) => entry.id)
      : parseIds(input.moduleInclude);

  const seen = new Set<string>();
  const entries: ModuleInventoryEntry[] = [];

  for (const id of ids) {
    if (seen.has(id)) {
      throw new Error(`Duplicate module id: ${id}`);
    }

    seen.add(id);

    const entry = byId.get(id);

    if (entry === undefined) {
      throw new Error(
        `Unknown module id: ${id}. The inventory holds: ${[...byId.keys()].join(", ") || "nothing"}.`
      );
    }

    const absolute = join(input.workspaceRoot, entry.entrypoint);

    if (!existsSync(absolute)) {
      throw new Error(
        `Module "${id}" entrypoint ${entry.entrypoint} does not exist.`
      );
    }

    entries.push(entry);
  }

  return { source, ids, entries };
}
