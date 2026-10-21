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

  it("carries the three cached tenant readers, the job queue, the file store, the mailer and the public link builder", () => {
    expectTypeOf<keyof TenantContext>().toEqualTypeOf<
      | "db"
      | "env"
      | "settings"
      | "branding"
      | "entitlements"
      | "jobQueue"
      | "events"
      | "capabilities"
      | "fileStorage"
      | "mailer"
      | "publicUrl"
      | "auth"
      | "authRequestScope"
      | "correlationScope"
    >();
  });
});
