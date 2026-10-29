import { validateModule } from "@genie/core";
import { describe, expect, it } from "vitest";

import { invoicesModule } from "./module.ts";

describe("the invoices module declaration", () => {
  it("satisfies every rule the contract validator checks", () => {
    expect(validateModule(invoicesModule)).toEqual([]);
  });

  it("contributes no frame origin until it frames something", async () => {
    expect(await invoicesModule.contentSecurityPolicy.frameOrigins()).toEqual(
      []
    );
  });

  it("hands core a migration declaration it has not read yet", () => {
    expect(invoicesModule.schema.migrations).toBeInstanceOf(Function);
    expect(invoicesModule.schema.migrationsTable).toBe(
      "__drizzle_migrations_invoices"
    );
  });

  it("reads its own SQL when core calls the declaration", () => {
    // Calling it proves the static URLs resolve to real files, which is what the
    // deferred read defers. Nothing reads them at import time.
    const history = invoicesModule.schema.migrations();

    expect(history).toHaveLength(1);
    expect(history[0]?.sql.join("")).toContain("allocation_event");
  });
});
