import { describe, expect, it } from "vitest";

import { osUserName, runGenieOps } from "./index.ts";

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

/**
 * R-58a and D-4: `--sso-domain` is required, and a value that is not a lower-case domain is a parse
 * failure. A parse failure answers the one generic refusal before any environment check, and the
 * rejected value never reaches the output.
 */
describe("genie-ops realm local-accounts enable parsing", () => {
  it.each([
    [["realm", "local-accounts", "enable"]],
    [["realm", "local-accounts", "enable", "--sso-domain", "Company.example"]],
  ])("refuses %j with the generic refusal", async (argv) => {
    const lines: string[] = [];

    const code = await runGenieOps(argv, {
      source: {},
      compiledModules: [],
      histories: [],
      output: (line) => lines.push(line),
      errorOutput: (line) => lines.push(line),
    });

    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("genie-ops: unknown or invalid command");
    expect(lines.join("\n")).not.toContain("Company.example");
  });
});
