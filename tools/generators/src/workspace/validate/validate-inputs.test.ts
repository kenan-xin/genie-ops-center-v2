import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WORKSPACE_ROOT = join(import.meta.dirname, "../../../../..");

type NxConfig = {
  readonly targetDefaults: {
    readonly validate: { readonly inputs: readonly string[] };
  };
};

describe("the validate target's inputs", () => {
  it("declares the whole-workspace ignore globs that decide which directories Nx treats as projects", () => {
    // SAFETY: nx.json is a JSON object, and the assertions below fail loudly when
    // the validate target or its inputs array is absent.
    const config = JSON.parse(
      readFileSync(join(WORKSPACE_ROOT, "nx.json"), "utf8")
    ) as NxConfig;

    const inputs = config.targetDefaults.validate.inputs;

    // The exact globs, not a looser shape: a subtree-only spelling such as
    // `{workspaceRoot}/.beads/**/.gitignore` also starts at the root, contains
    // `**` and ends in the filename, yet omits the root file and every nested
    // ignore file outside `.beads`. `**/` is what reaches all of them.
    expect(inputs).toContain("{workspaceRoot}/**/.gitignore");
    expect(inputs).toContain("{workspaceRoot}/**/.nxignore");
  });
});
