import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const WORKSPACE_ROOT = join(import.meta.dirname, "../../../../..");

const REGISTRY = "apps/genie/src/modules.ts";

const GENERATE = "apps/genie/tools/generate-registry.ts";

const roots: string[] = [];

/**
 * A staged build root holding one synthetic module. The generator reads its
 * inventory from `--root` and writes there, so the check never mutates the
 * checkout's own generated registry — a side effect that would change the
 * Docker build context and race concurrent tasks.
 */
function stagedRoot(ids: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), "genie-clean-checkout-"));

  roots.push(root);

  for (const id of ids) {
    const packageRoot = join(root, "packages/modules", id);

    mkdirSync(join(packageRoot, "src"), { recursive: true });

    writeFileSync(
      join(packageRoot, "package.json"),
      `${JSON.stringify({
        name: `@genie/module-${id}`,
        genie: { module: { id, entrypoint: "src/index.ts" } },
      })}\n`,
      "utf8"
    );

    writeFileSync(join(packageRoot, "src/index.ts"), "export {};\n", "utf8");
  }

  return root;
}

type Run = { readonly status: number };

/** Runs the real generator against a staged root, as the build does. */
function generate(root: string, moduleInclude: string): Run {
  try {
    execFileSync("node", [GENERATE, "--root", root], {
      cwd: WORKSPACE_ROOT,
      encoding: "utf8",
      env: { ...process.env, MODULE_INCLUDE: moduleInclude },
    });

    return { status: 0 };
  } catch (error) {
    // SAFETY: execFileSync rejects with an Error augmented with a numeric
    // status; a signal-terminated run reports null, which must not read green.
    const status = (error as { status?: number | null }).status ?? 1;

    return { status };
  }
}

const registryIn = (root: string) =>
  readFileSync(join(root, "apps/genie/src", "modules.ts"), "utf8");

afterAll(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

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
    const root = stagedRoot(["placeholder"]);

    expect(generate(root, "placeholder").status).toBe(0);

    const once = registryIn(root);

    expect(generate(root, "placeholder").status).toBe(0);
    expect(registryIn(root)).toBe(once);
    expect(once).toContain("@genie/module-placeholder");
  });

  it("keeps an unset selection distinct from an explicitly empty one", () => {
    const root = stagedRoot(["placeholder"]);

    generate(root, "placeholder");

    expect(generate(root, "").status).toBe(0);

    expect(registryIn(root)).not.toContain("@genie/module-placeholder");
  });

  it("fails on an unknown module id instead of widening the selection", () => {
    const root = stagedRoot(["placeholder"]);

    expect(generate(root, "does-not-exist").status).not.toBe(0);
  });
});
