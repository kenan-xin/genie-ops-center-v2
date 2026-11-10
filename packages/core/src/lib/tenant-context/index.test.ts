import { describe, expectTypeOf, it } from "vitest";

import type { TenantContext } from "./index.ts";

describe("TenantContext", () => {
  it("carries the four cached tenant readers, the job queue, the file store, the mailer, the public link builder and the dataset registry", () => {
    expectTypeOf<keyof TenantContext>().toEqualTypeOf<
      | "db"
      | "env"
      | "settings"
      | "branding"
      | "entitlements"
      | "categories"
      | "jobQueue"
      | "events"
      | "capabilities"
      | "datasets"
      | "fileStorage"
      | "mailer"
      | "publicUrl"
      | "auth"
      | "authRequestScope"
      | "correlationScope"
    >();
  });
});
