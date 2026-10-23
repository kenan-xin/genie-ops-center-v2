import { describe, expect, it } from "vitest";

import { activeHref } from "./active-link.ts";
import type { ShellNavigation } from "./types.ts";

const navigation: ShellNavigation = {
  pinned: [{ id: "p", label: "Pinned", href: "/reports/daily" }],
  workspace: [{ id: "w", label: "Reports", href: "/reports" }],
  categories: [
    {
      id: "c",
      name: "Operations",
      entries: [{ id: "o", label: "Orders", href: "/orders" }],
    },
  ],
  admin: [
    {
      id: "people-and-access",
      label: "People and access",
      entries: [{ id: "core-people", label: "People", href: "/admin/people" }],
    },
  ],
};

describe("activeHref", () => {
  it("matches an exact path", () => {
    expect(activeHref(navigation, "/orders")).toBe("/orders");
  });

  it("matches a link that prefixes the path at a slash", () => {
    expect(activeHref(navigation, "/admin/people/123")).toBe("/admin/people");
  });

  it("does not match a prefix that stops mid-segment", () => {
    expect(activeHref(navigation, "/admin/peoplex")).toBeUndefined();
  });

  it("picks the longer of two matching links, wherever each sits", () => {
    expect(activeHref(navigation, "/reports/daily/today")).toBe(
      "/reports/daily"
    );
  });

  it("answers undefined when nothing matches", () => {
    expect(activeHref(navigation, "/elsewhere")).toBeUndefined();
  });
});
