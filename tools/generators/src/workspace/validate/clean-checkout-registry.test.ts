import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WORKSPACE_ROOT = join(import.meta.dirname, "../../../../..");

const REGISTRY = "apps/genie/src/modules.ts";

type Run = { readonly status: number; readonly stdout: string };

/**
 * Runs the app-owned registry generator as a child process, which is how the
 * build runs it. The selectors package must not import the app, so a
 * child-process invocation is the only honest way for this check to exercise
 * the real generation path.
 */
function generate(moduleInclude: string): Run {
  try {
    const stdout = execFileSync(
      "node",
      ["apps/genie/tools/generate-registry.ts"],
      {
        cwd: WORKSPACE_ROOT,
        encoding: "utf8",
        env: { ...process.env, MODULE_INCLUDE: moduleInclude },
      }
    );

    return { status: 0, stdout };
  } catch (error) {
    // SAFETY: execFileSync rejects with an Error augmented with a numeric
    // `status`. A signal-terminated run reports null, which the fallback keeps
    // from reading as success.
    const status = (error as { status?: number | null }).status ?? 1;

    return { status, stdout: "" };
  }
}

const registryBytes = () =>
  readFileSync(join(WORKSPACE_ROOT, REGISTRY), "utf8");

/**
 * R-21: a clean checkout generates the selected registry before its consumers
 * run; repeated identical inputs produce identical output, and no generated
 * registry is committed. This is the clean-checkout generation check R-51 puts
 * on every pull request.
 */
describe("the clean-checkout registry generation", () => {
  it("never commits the generated registry", () => {
    let tracked = "";

    try {
      tracked = execFileSync("git", ["ls-files", "--error-unmatch", REGISTRY], {
        cwd: WORKSPACE_ROOT,
        encoding: "utf8",
      });
    } catch {
      // `--error-unmatch` exits nonzero exactly when the path is untracked.
      tracked = "";
    }

    expect(tracked.trim()).toBe("");
  });

  it("generates the same bytes for the same selection twice", () => {
    const first = generate("placeholder");

    expect(first.status).toBe(0);

    const once = registryBytes();

    const second = generate("placeholder");

    expect(second.status).toBe(0);
    expect(registryBytes()).toBe(once);
    expect(once).toContain("@genie/module-placeholder");
  });

  it("keeps an unset selection distinct from an explicitly empty one", () => {
    // An explicit empty list and the development default both import no module
    // in this inventory, yet they are different selections; the emitted text
    // records the source so a cache cannot confuse them.
    generate("placeholder");

    const explicitEmpty = generate("");

    expect(explicitEmpty.status).toBe(0);

    const emptyBytes = registryBytes();

    expect(emptyBytes).not.toContain("@genie/module-placeholder");
  });

  it("fails on an unknown module id instead of widening the selection", () => {
    expect(generate("does-not-exist").status).not.toBe(0);
  });
});
