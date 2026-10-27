import { describe, expect, it } from "vitest";

import { isClientRoute } from "./shell-link.ts";

describe("isClientRoute (NAV-1)", () => {
  it.each([
    ["/admin/people", true],
    ["/admin/people?selected=u1", true],
    ["/", true],
    ["/viewer/placeholder", false],
    ["/viewer/", false],
    ["//evil.example/path", false],
    ["/\\evil.example", false],
    ["https://id.example/realms/acme/account", false],
    ["mailto:help@example.com", false],
  ])("%s goes to the router: %s", (href, expected) => {
    expect(isClientRoute(href)).toBe(expected);
  });
});
