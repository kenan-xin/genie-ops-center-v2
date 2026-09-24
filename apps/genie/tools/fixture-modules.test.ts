import { validateRegistry } from "@genie/core";
import { describe, expect, it } from "vitest";

import { failingViewerModule } from "./fixture-modules/failing-viewer/src/index.ts";
import { invalidViewerModule } from "./fixture-modules/invalid-viewer/src/index.ts";
import { permittedViewerModule } from "./fixture-modules/permitted-viewer/src/index.ts";

describe("the viewer fixture module declarations", () => {
  it("use the module-id ledger name required by the contract", () => {
    const modules = [
      failingViewerModule,
      invalidViewerModule,
      permittedViewerModule,
    ];

    expect(validateRegistry(modules)).toEqual([]);

    for (const module of modules) {
      expect(module.schema.migrationsTable).toBe(
        `__drizzle_migrations_${module.identity.id.replaceAll("-", "_")}`
      );
    }
  });
});
