import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WORKSPACE_ROOT = join(import.meta.dirname, "../../../../..");

type NxConfig = {
  readonly targetDefaults: {
    readonly validate: { readonly inputs: readonly string[] };
  };
};

/**
 * True when the inputs declare a workspace-rooted glob for `name` that reaches
 * below the root. A nested ignore file changes which files and directories Nx
 * treats as projects, so a root-only pattern would miss it.
 */
function declaresNestedIgnoreInput(
  inputs: readonly string[],
  name: string
): boolean {
  return inputs.some(
    (input) =>
      input.startsWith("{workspaceRoot}/") &&
      input.includes("**") &&
      input.endsWith(`/${name}`)
  );
}

describe("the validate target's inputs", () => {
  it("declares the ignore files that decide which directories Nx treats as projects", () => {
    // SAFETY: nx.json is a JSON object, and the assertions below fail loudly when
    // the validate target or its inputs array is absent.
    const config = JSON.parse(
      readFileSync(join(WORKSPACE_ROOT, "nx.json"), "utf8")
    ) as NxConfig;

    const inputs = config.targetDefaults.validate.inputs;

    expect(declaresNestedIgnoreInput(inputs, ".gitignore")).toBe(true);
    expect(declaresNestedIgnoreInput(inputs, ".nxignore")).toBe(true);
  });
});
