import { describe, expect, it } from "vitest";

import { osUserName } from "./index.ts";

/**
 * The passwd lookup is driven to fail, which is what an arbitrary `docker run --user <uid>` does.
 * `osUserName` must not let that throw escape the audited path, or the run would write no audit
 * row and leak its pool (R-64).
 */
describe("osUserName", () => {
  it("falls back to the numeric uid when the passwd lookup fails", () => {
    const uid = process.getuid?.();

    const name = osUserName(() => {
      throw new Error("uv_os_get_passwd returned ENOENT");
    });

    expect(name).toBe(uid === undefined ? "uid:unknown" : `uid:${uid}`);
  });
});
