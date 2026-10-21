import { describe, expect, it } from "vitest";

import { AuthRequestScope } from "./request-scope.ts";

describe("OAuth group claim reading", () => {
  it("uses named groups when they are present", async () => {
    const scope = new AuthRequestScope();

    await scope.run(async () => {
      scope.capture(["Nursing", "On Call"], true);

      expect(scope.current()?.groups).toEqual(["Nursing", "On Call"]);
    });
  });

  it("reads a missing groups claim with the marker as an empty list", async () => {
    const scope = new AuthRequestScope();

    await scope.run(async () => {
      scope.capture(undefined, true);

      expect(scope.current()?.groups).toEqual([]);
    });
  });

  it("keeps both missing claims absent", async () => {
    const scope = new AuthRequestScope();

    await scope.run(async () => {
      scope.capture(undefined, undefined);

      expect(scope.current()?.groups).toBeUndefined();
    });
  });
});
