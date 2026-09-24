import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DIGEST_INPUTS,
  inputDigest,
  reusableMarker,
  type GitRunner,
} from "./shared-empty-image.ts";
import { REPO_ROOT } from "./stage-workspace.ts";

/**
 * The digest is what lets the prune proof and the matrix share one build. It has
 * to decide exactly what the Dockerfile copies, so a build of different inputs
 * is never reused. The file list alone missed everything outside the resolver,
 * the Dockerfile and the fixture, and the working tree can change without a
 * commit, so these cases pin the two additions: the `HEAD` revision and the
 * working-tree state, including the bytes of every file `git status` reports.
 *
 * They run against a real git repository in a temporary directory rather than a
 * stub, so the command lines this module builds are the ones git actually
 * reads. `DIGEST_INPUTS` is staged from the checkout so the file half of the
 * digest has real inputs beside the synthetic ones.
 */
function git(args: readonly string[], cwd: string): string {
  const result = spawnSync("git", [...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    },
  });

  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }

  return result.stdout;
}

/** A committed file that is not among the digest's original inputs. */
const OUTSIDE_INPUT = "apps/genie/src/outside-the-digest.ts";

/** A git that cannot be reached, for the fail-closed case. */
const unavailable: GitRunner = () => {
  throw new Error("git: command not found");
};

let root = "";

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "genie-image-digest-"));

  git(["init", "-q"], root);
  git(["config", "user.email", "test@example.com"], root);
  git(["config", "user.name", "test"], root);

  for (const input of DIGEST_INPUTS) {
    cpSync(join(REPO_ROOT, input), join(root, input), { recursive: true });
  }

  mkdirSync(join(root, "apps/genie/src"), { recursive: true });
  writeFileSync(
    join(root, OUTSIDE_INPUT),
    "export const version = 1;\n",
    "utf8"
  );

  git(["add", "-A"], root);
  git(["commit", "-q", "-m", "init"], root);
});

afterAll(() => {
  if (root !== "") rmSync(root, { recursive: true, force: true });
});

describe("the shared empty image input digest", () => {
  it("is stable while the tree is unchanged", () => {
    expect(inputDigest({ repoRoot: root })).toBe(
      inputDigest({ repoRoot: root })
    );
  });

  it("changes when a committed file outside the old inputs is edited", () => {
    const clean = inputDigest({ repoRoot: root });
    const path = join(root, OUTSIDE_INPUT);

    writeFileSync(path, "export const version = 2;\n", "utf8");

    expect(inputDigest({ repoRoot: root })).not.toBe(clean);

    git(["checkout", "--", OUTSIDE_INPUT], root);

    expect(inputDigest({ repoRoot: root })).toBe(clean);
  });

  it("changes when an untracked file outside the old inputs is added", () => {
    const clean = inputDigest({ repoRoot: root });
    const path = join(root, "apps/genie/src/untracked.ts");

    writeFileSync(path, "export const fresh = true;\n", "utf8");

    expect(inputDigest({ repoRoot: root })).not.toBe(clean);

    rmSync(path, { force: true });

    expect(inputDigest({ repoRoot: root })).toBe(clean);
  });

  it("changes when a committed revision is made", () => {
    const parent = inputDigest({ repoRoot: root });

    writeFileSync(
      join(root, OUTSIDE_INPUT),
      "export const version = 3;\n",
      "utf8"
    );
    git(["add", OUTSIDE_INPUT], root);
    git(["commit", "-q", "-m", "second"], root);

    expect(inputDigest({ repoRoot: root })).not.toBe(parent);

    git(["reset", "-q", "--hard", "HEAD~1"], root);
  });

  it("fails closed when git cannot answer", () => {
    expect(() => inputDigest({ repoRoot: root, git: unavailable })).toThrow();
  });
});

describe("the reuse decision", () => {
  const marker = {
    runId: "42",
    digest: "abc",
    imageId: "sha256:deadbeef",
    log: "build log",
  };

  it("reuses a marker that matches this run's digest and image", () => {
    expect(
      reusableMarker({
        existing: "sha256:deadbeef",
        marker,
        digest: "abc",
        runId: "42",
      })
    ).toBe(marker);
  });

  it("refuses to reuse when no digest could be computed", () => {
    expect(
      reusableMarker({
        existing: "sha256:deadbeef",
        marker,
        digest: undefined,
        runId: "42",
      })
    ).toBeUndefined();
  });

  it("refuses to reuse for a run whose id or digest differs", () => {
    expect(
      reusableMarker({
        existing: "sha256:deadbeef",
        marker,
        digest: "other",
        runId: "42",
      })
    ).toBeUndefined();
    expect(
      reusableMarker({
        existing: "sha256:deadbeef",
        marker,
        digest: "abc",
        runId: "43",
      })
    ).toBeUndefined();
  });
});
