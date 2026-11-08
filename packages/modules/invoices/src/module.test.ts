import { validateModule } from "@genie/core";
import { describe, expect, it } from "vitest";

import { invoicesModule } from "./module.ts";

describe("the invoices module declaration", () => {
  it("satisfies every rule the contract validator checks", () => {
    expect(validateModule(invoicesModule)).toEqual([]);
  });

  it("adds Invoices and Payments viewer on Access, the owner's default access role (A6)", () => {
    // The editor changes shared money records, so an administrator picks it on purpose (owner, 2026-11-02).
    expect(invoicesModule.defaultAccessRole).toBe(
      "Invoices and Payments viewer"
    );
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

    expect(history).toHaveLength(3);
    expect(history[0]?.sql.join("")).toContain("allocation_event");
    expect(history[1]?.sql.join("")).toContain("reading_status");
    expect(history[2]?.sql.join("")).toContain("invoice_updated_at_idx");
  });
});
