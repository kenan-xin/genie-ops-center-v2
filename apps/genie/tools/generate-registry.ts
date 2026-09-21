import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  emitRegistryModule,
  readModuleInventory,
  resolveModuleSelection,
} from "@genie/generators";

/**
 * The application-owned generation target of ADR 0008.
 *
 * Tooling reads a data-only inventory and emits import text. It never imports or
 * evaluates a module declaration. The application validates the selected
 * declarations separately, at load, in src/registry.ts.
 */
const workspaceRoot = resolve(import.meta.dirname, "../../..");

const target = resolve(workspaceRoot, "apps/genie/src/modules.ts");

const selection = resolveModuleSelection({
  moduleInclude: process.env.MODULE_INCLUDE,
  inventory: readModuleInventory(workspaceRoot),
  workspaceRoot,
});

mkdirSync(dirname(target), { recursive: true });

writeFileSync(target, emitRegistryModule(selection), "utf8");

process.stdout.write(
  `generated ${target} for selection ${selection.source} [${selection.ids.join(", ")}]\n`
);
