import { describe, expect, it } from "vitest";

import { openApiDocument } from "./generate-openapi.ts";

/**
 * The oRPC behavior item "oc.route({ method, path }) drives the generated paths and methods, with
 * the zod 4 converter from @orpc/zod/zod4" (ADR 0011). The checked-in document is otherwise only
 * compared as a file by the CI check, which would pass on any file a contract change rewrote, so
 * this test makes the behavior itself explicit: a version bump that stops reading the declared
 * route fails here, not in a reviewer's diff.
 */
describe("the generated OpenAPI document", () => {
  it("takes each path and method from the contract's oc.route", async () => {
    const document = await openApiDocument();

    const people = document.paths?.["/people"];

    // The collection reads at GET /people and creates at POST /people, both declared on the
    // procedure, not derived from the router key (decision 7).
    expect(people?.get?.operationId).toBe("people.list");
    expect(people?.post?.operationId).toBe("people.add");

    // An action keeps its method and its full path, with the input key in the path parameter.
    const resend = document.paths?.["/people/{personId}/resend-invitation"];

    expect(resend?.post?.operationId).toBe("people.resendInvitation");
    expect(Object.keys(resend ?? {})).toEqual(["post"]);

    // Every module in packages/modules joins core's areas in the same document (decision 4).
    expect(document.paths?.["/placeholder/records"]?.get?.operationId).toBe(
      "placeholder.read"
    );
  });
});
