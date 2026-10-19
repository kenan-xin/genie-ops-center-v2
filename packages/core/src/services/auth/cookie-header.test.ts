import { describe, expect, it } from "vitest";

import { readCookie, withoutCookie } from "./index.ts";

/**
 * The member's handler hides an idle session from Better Auth by removing the session cookie from
 * the request (R-14). The other cookies, the two-factor challenge among them, must reach Better
 * Auth unchanged, and a cookie whose name only starts with the session cookie's name stays.
 */
describe("withoutCookie", () => {
  it("removes every value of the named cookie and keeps the others in order", () => {
    const header =
      "a=1; genie-session=token.sig; genie-session_data=x; genie-session=again; b=2";

    const kept = withoutCookie(header, "genie-session");

    expect(kept).toBe("a=1; genie-session_data=x; b=2");
    expect(readCookie(kept, "genie-session")).toBeUndefined();
  });

  it.each([
    "genie-session =token.sig",
    "genie-session\t=token.sig",
    " genie-session = token.sig ",
    "genie-session  \t =token.sig",
  ])(
    "removes the cookie whatever whitespace surrounds its name: %j",
    (part) => {
      const header = `a=1; ${part}; b=2`;

      expect(readCookie(header, "genie-session")).toBe("token.sig");
      expect(withoutCookie(header, "genie-session")).toBe("a=1; b=2");
    }
  );

  it("answers an empty header when the named cookie was the only one", () => {
    expect(withoutCookie("genie-session=token.sig", "genie-session")).toBe("");
  });
});
