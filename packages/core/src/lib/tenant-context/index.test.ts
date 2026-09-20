import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { describe, expectTypeOf, it } from "vitest";

import type { DeploymentEnvironment, TenantContext } from "./index.ts";

describe("TenantContext", () => {
  it("carries the Drizzle database over pg", () => {
    expectTypeOf<TenantContext["db"]>().toExtend<NodePgDatabase>();
  });

  it("carries the validated environment the image reads", () => {
    expectTypeOf<TenantContext["env"]>().toEqualTypeOf<DeploymentEnvironment>();
  });

  it("holds no changing reader in Section 0", () => {
    expectTypeOf<keyof TenantContext>().toEqualTypeOf<"db" | "env">();
  });
});
