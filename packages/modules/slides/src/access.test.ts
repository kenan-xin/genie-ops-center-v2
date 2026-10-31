import { can, createRequestPrincipal } from "@genie/core";
import { describe, expect, it } from "vitest";

/**
 * The authorization half of this module's denial proof, against the real seam.
 *
 * `can()` is the only permission check there is (DEC-39). A caller who holds no key is refused
 * every key of this module, and the application's page loader asks the same question before it
 * mounts a page of this module. The granted path is proved with real role assignments against a
 * real database in `testing/decks.integration.test.ts`, never with a stand-in answer here.
 */
const identity = { userId: "u1", groups: [], authenticated: true };

describe("the slides access decision", () => {
  it("refuses a caller who holds no key at all", async () => {
    const caller = createRequestPrincipal(identity, () =>
      Promise.resolve({ keys: new Set(), scopes: new Map() })
    );

    expect(await can(caller, "slides:use")).toBe(false);
    expect(await can(caller, "slides:read")).toBe(false);
    expect(await can(caller, "slides:write")).toBe(false);
  });
});
