import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WORKSPACE_ROOT = join(import.meta.dirname, "../../..");

type NxConfig = {
  readonly targetDefaults: {
    readonly validate: { readonly inputs: readonly string[] };
  };
};

/** The validate target's declared inputs, read from the real nx.json. */
function validateInputs(): readonly string[] {
  // SAFETY: nx.json is a JSON object, and the assertions below fail loudly when
  // the validate target or its inputs array is absent.
  const config = JSON.parse(
    readFileSync(join(WORKSPACE_ROOT, "nx.json"), "utf8")
  ) as NxConfig;

  return config.targetDefaults.validate.inputs;
}

describe("the validate target's inputs", () => {
  it("declares the whole-workspace ignore globs that decide which directories Nx treats as projects", () => {
    const inputs = validateInputs();

    // The exact globs, not a looser shape: a subtree-only spelling such as
    // `{workspaceRoot}/.beads/**/.gitignore` also starts at the root, contains
    // `**` and ends in the filename, yet omits the root file and every nested
    // ignore file outside `.beads`. `**/` is what reaches all of them.
    expect(inputs).toContain("{workspaceRoot}/**/.gitignore");
    expect(inputs).toContain("{workspaceRoot}/**/.nxignore");
  });

  it("declares no workspace-wide vitest config glob, which no check reads", () => {
    const inputs = validateInputs();

    // `validate` reads the generator's own configs through `{projectRoot}/**/*`.
    // A workspace-wide `vitest*.config.*` input only makes an unrelated project's
    // config edit miss the cache, so it must not come back.
    expect(
      inputs.filter((input) => input.startsWith("{workspaceRoot}/**/vitest"))
    ).toEqual([]);
  });

  it("includes the module container README, which the canonical-doc check reads", () => {
    const inputs = validateInputs();

    // `packages/*/README.md` also matches `packages/modules/README.md`. The
    // canonical generator-command check in `hygiene` reads that container
    // README, so it is a real input now and the earlier exclusion is gone.
    expect(inputs).toContain("{workspaceRoot}/packages/*/README.md");
    expect(inputs).not.toContain("!{workspaceRoot}/packages/modules/README.md");
  });

  it("declares the active canonical docs the generator-command check reads", () => {
    const inputs = validateInputs();

    for (const input of [
      "{workspaceRoot}/CLAUDE.md",
      "{workspaceRoot}/AGENTS.md",
      "{workspaceRoot}/docs/specs/*.md",
      "{workspaceRoot}/docs/architecture/*.md",
      "{workspaceRoot}/docs/core/*.md",
      "{workspaceRoot}/docs/runbooks/*.md",
      "{workspaceRoot}/docs/tickets/spec-0/08-module-and-tenant-generators/*.md",
    ]) {
      expect(inputs).toContain(input);
    }
  });

  it("keeps the doc inputs to the active canonical locations, never every doc", () => {
    const inputs = validateInputs();

    // A broad `docs/**` glob would pull historical audits, handoffs, design
    // history and transcripts into the cache key. The check reads one ticket
    // folder, so that is the only `docs/tickets` input allowed.
    expect(inputs.filter((input) => input.includes("docs/tickets"))).toEqual([
      "{workspaceRoot}/docs/tickets/spec-0/08-module-and-tenant-generators/*.md",
    ]);
    expect(inputs).not.toContain("{workspaceRoot}/docs/**/*.md");
    expect(inputs).not.toContain("{workspaceRoot}/docs/**");
  });

  // genie-ops-center-v2-d05: the checks moved to `@genie/workspace-validation`,
  // but the workspace-policy helpers they run (the classifier, the module naming
  // and test rules, the README rule) live in `@genie/generators`. That package
  // stays a real input — the exact coverage the checks had when they lived there —
  // so a helper change still invalidates the cache instead of replaying a stale
  // validate result.
  it("keeps the generators package the checks read as an input", () => {
    expect(validateInputs()).toContain("{workspaceRoot}/tools/generators/**/*");
  });
});
