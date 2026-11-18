import { describe, expect, it } from "vitest";

import { accessHref, accessLandingHref } from "./access-link.ts";

describe("accessLandingHref (P12-9)", () => {
  it.each([
    [{}, "/admin/access/overview"],
    [{ module: "placeholder" }, "/admin/access/overview?module=placeholder"],
    [{ role: "r1", q: "x" }, "/admin/access/overview?role=r1"],
    [
      { recipient: "g1", module: "placeholder", q: "x" },
      "/admin/access/grants?recipient=g1&module=placeholder&q=x",
    ],
    [
      { recipient: ["g1", "g2"], role: "r1" },
      "/admin/access/grants?recipient=g1&recipient=g2&role=r1",
    ],
  ] as const)("sends %j to %s", (params, expected) => {
    expect(accessLandingHref(params)).toBe(expected);
  });

  it("builds an Access link through the same landing", () => {
    expect(accessHref({ role: "r1" })).toBe("/admin/access/overview?role=r1");
    expect(accessHref({ recipient: "p1" })).toBe(
      "/admin/access/grants?recipient=p1"
    );
  });
});
