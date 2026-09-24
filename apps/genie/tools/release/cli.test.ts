import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const CLI = resolve(import.meta.dirname, "cli.ts");

const IDENTITY = `sha256:${"b".repeat(64)}`;

/** The manifest digest the stubbed registry reports for a pushed ref. */
const PUSH_DIGEST = `sha256:${"e".repeat(64)}`;

const temporary: string[] = [];

/**
 * A workspace with one customer and a pair of stub binaries on `PATH`.
 *
 * The stubs are the smallest honest substitute for a Docker daemon and the Nx
 * gates: the real wrapper, CLI and pipeline run, and the stub records exactly
 * what the pipeline asked for. This proves the ordering and the identity
 * handoff at the wrapper boundary, which the pipeline's own unit tests cannot
 * see.
 */
function stubWorkspace(
  pnpmExit: number,
  pnpmExtra = "",
  dockerFailOn = "",
  configDigest = IDENTITY
) {
  const root = mkdtempSync(join(tmpdir(), "genie-release-cli-"));

  temporary.push(root);

  mkdirSync(join(root, "customers/acme/deploy"), { recursive: true });
  writeFileSync(
    join(root, "customers/acme/deploy/modules.txt"),
    "placeholder\n",
    "utf8"
  );

  // The smoke runs from `apps/genie` in the real repository; the fixture needs
  // that directory to exist for the stubbed smoke invocation to start at all.
  mkdirSync(join(root, "apps/genie"), { recursive: true });

  const bin = join(root, "bin");

  mkdirSync(bin);

  const log = join(root, "calls.log");

  writeFileSync(log, "", "utf8");

  const manifest = JSON.stringify({
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    config: {
      mediaType: "application/vnd.oci.image.config.v1+json",
      digest: configDigest,
      size: 768,
    },
    layers: [],
  });

  const stub = (name: string, body: string) => {
    const path = join(bin, name);

    writeFileSync(path, `#!/bin/sh\n${body}\n`, "utf8");
    chmodSync(path, 0o755);
  };

  stub(
    "pnpm",
    `printf 'pnpm %s ENV=%s MODULE_INCLUDE=%s\\n' "$*" "$GENIE_SMOKE_IMAGE" "$MODULE_INCLUDE" >> "$STUB_LOG"\nprintf 'gate stdout marker\\n'\nprintf 'gate stderr marker\\n' >&2\n${pnpmExtra}\nexit ${pnpmExit}`
  );
  stub(
    "docker",
    `printf 'docker %s\\n' "$*" >> "$STUB_LOG"
prev=""
for arg in "$@"; do
  if [ "$prev" = "--iidfile" ]; then printf '${IDENTITY}\\n' > "$arg"; fi
  prev="$arg"
done
if [ -n "${dockerFailOn}" ] && [ "$1" = "${dockerFailOn}" ]; then exit 1; fi
if [ "$1" = "push" ]; then
  printf 'latest: digest: ${PUSH_DIGEST} size: 528\\n'
  exit 0
fi
if [ "$1" = "buildx" ] && [ "$2" = "imagetools" ] && [ "$3" = "inspect" ]; then
  printf '%s\\n' '${manifest}'
  exit 0
fi
exit 0`
  );

  return { root, bin, log };
}

function runCli(
  workspace: ReturnType<typeof stubWorkspace>,
  args: readonly string[]
) {
  try {
    execFileSync("node", [CLI, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${workspace.bin}:${process.env.PATH ?? ""}`,
        STUB_LOG: workspace.log,
      },
    });

    return { status: 0, stderr: "" };
  } catch (error) {
    // SAFETY: execFileSync rejects with an Error augmented with a numeric
    // status and captured stderr; a signal-terminated run reports null status.
    const failure = error as {
      status?: number | null;
      stderr?: string | Buffer;
    };

    return {
      status: failure.status ?? 1,
      stderr: String(failure.stderr ?? ""),
    };
  }
}

afterEach(() => {
  for (const path of temporary.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("the customer image release wrapper", () => {
  it("reads modules.txt, smokes the built digest and pushes that exact identity", () => {
    const workspace = stubWorkspace(0);

    const outcome = runCli(workspace, [
      "acme",
      "1.2.3",
      "--repo-root",
      workspace.root,
      "--registry",
      "ghcr.io/owner/genie-ops-center",
    ]);

    const log = readFileSync(workspace.log, "utf8");

    expect(outcome.status, `${outcome.stderr}\nLOG:\n${log}`).toBe(0);

    // The gate environment carries the selection...
    expect(log).toContain("MODULE_INCLUDE=placeholder");

    // ...and the build receives it as its one build argument. This asserts on
    // the docker build line itself, not the pnpm gate line that also prints the
    // variable, which is what the previous duplicate assertion actually matched.
    const buildLine = log
      .split("\n")
      .find((line) => line.startsWith("docker build"));

    expect(buildLine).toBeDefined();
    expect(buildLine).toContain("--build-arg MODULE_INCLUDE=placeholder");

    // The smoke ran with the identity. The identity is then tagged with a
    // run-unique temporary ref, that ref is pushed, and only afterwards is
    // the stable published tag created from the digest the push reported.
    const smokeAt = log.indexOf("vitest.release-smoke.config.ts");

    const tagLines = log
      .split("\n")
      .filter((line) => line.startsWith(`docker tag ${IDENTITY} `));

    const pushedLine = log
      .split("\n")
      .find((line) => line.startsWith("docker push "));

    expect(smokeAt).toBeGreaterThan(-1);
    expect(tagLines).toHaveLength(1);
    expect(pushedLine).toBeDefined();
    expect(log.indexOf(tagLines[0] ?? "")).toBeGreaterThan(smokeAt);
    expect(log.indexOf(pushedLine ?? "")).toBeGreaterThan(
      log.indexOf(tagLines[0] ?? "")
    );
    expect(log).toContain(`ENV=${IDENTITY}`);

    // The stable published ref is never tagged or pushed directly, so a
    // retag between the steps cannot change the bytes under it.
    const pushedRef = (pushedLine ?? "").slice("docker push ".length);

    expect(pushedRef).not.toBe("ghcr.io/owner/genie-ops-center:acme-1.2.3");
    expect(log).not.toContain(
      `docker tag ${IDENTITY} ghcr.io/owner/genie-ops-center:acme-1.2.3`
    );
    expect(log).not.toContain(
      "docker push ghcr.io/owner/genie-ops-center:acme-1.2.3"
    );

    // The stable tag is created registry-side from the pushed manifest's
    // digest, then inspected to verify it carries the smoke-tested identity.
    const pushAt = log.indexOf(pushedLine ?? "");
    const createAt = log.indexOf("imagetools create");

    expect(createAt).toBeGreaterThan(pushAt);
    expect(log.slice(createAt)).toContain(
      "--tag ghcr.io/owner/genie-ops-center:acme-1.2.3"
    );
    expect(log.slice(createAt)).toContain(
      `ghcr.io/owner/genie-ops-center@${PUSH_DIGEST}`
    );

    const inspectAt = log.indexOf("imagetools inspect");

    expect(inspectAt).toBeGreaterThan(createAt);
    expect(log.slice(inspectAt)).toContain(
      "ghcr.io/owner/genie-ops-center:acme-1.2.3"
    );
  });

  it("accepts an explicit --publish, which the release workflow passes", () => {
    const workspace = stubWorkspace(0);

    const outcome = runCli(workspace, [
      "acme",
      "1.2.3",
      "--repo-root",
      workspace.root,
      "--registry",
      "ghcr.io/owner/genie-ops-center",
      "--publish",
    ]);

    const log = readFileSync(workspace.log, "utf8");

    expect(outcome.status, `${outcome.stderr}\nLOG:\n${log}`).toBe(0);
    expect(log).toContain("docker push");
  });

  it("publishes nothing when a gate fails", () => {
    const workspace = stubWorkspace(1);

    const outcome = runCli(workspace, [
      "acme",
      "1.2.3",
      "--repo-root",
      workspace.root,
      "--registry",
      "ghcr.io/owner/genie-ops-center",
    ]);

    expect(outcome.status).toBe(1);

    const log = readFileSync(workspace.log, "utf8");

    expect(log).not.toContain("docker push");
    expect(log).not.toContain("docker build");
  });

  it("publishes nothing when the tag of the smoke-tested identity fails", () => {
    const workspace = stubWorkspace(0, "", "tag");

    const outcome = runCli(workspace, [
      "acme",
      "1.2.3",
      "--repo-root",
      workspace.root,
      "--registry",
      "ghcr.io/owner/genie-ops-center",
    ]);

    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain("release failed at publish-candidate");

    const log = readFileSync(workspace.log, "utf8");

    // The build and smoke ran; the tag that binds the pushed ref to the digest
    // failed, so the push never follows it.
    expect(log).toContain("docker build");
    expect(log).toContain("docker tag");
    expect(log).not.toContain("docker push");
  });

  it("creates no stable tag when the push of the temporary ref fails", () => {
    const workspace = stubWorkspace(0, "", "push");

    const outcome = runCli(workspace, [
      "acme",
      "1.2.3",
      "--repo-root",
      workspace.root,
      "--registry",
      "ghcr.io/owner/genie-ops-center",
    ]);

    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain("release failed at publish-candidate");

    const log = readFileSync(workspace.log, "utf8");

    // The temporary ref was pushed (and failed), but the promotion never ran,
    // so the stable published tag is never created from unverified bytes.
    expect(log).toContain("docker push");
    expect(log).not.toContain("imagetools create");
  });

  it("fails the release when the published tag does not carry the smoke-tested identity", () => {
    const workspace = stubWorkspace(0, "", "", `sha256:${"f".repeat(64)}`);

    const outcome = runCli(workspace, [
      "acme",
      "1.2.3",
      "--repo-root",
      workspace.root,
      "--registry",
      "ghcr.io/owner/genie-ops-center",
    ]);

    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain("release failed at publish-candidate");

    const log = readFileSync(workspace.log, "utf8");

    // The stable tag was created and then inspected; the mismatch between the
    // tag's config digest and the smoke-tested identity is what failed the
    // run, so a wrong promotion is detected before success is reported.
    expect(log).toContain("imagetools create");
    expect(log).toContain("imagetools inspect");
  });

  it("fails at the smoke and publishes nothing when only the smoke fails", () => {
    const workspace = stubWorkspace(
      0,
      'case "$*" in *release-smoke*) exit 1 ;; esac'
    );

    const outcome = runCli(workspace, [
      "acme",
      "1.2.3",
      "--repo-root",
      workspace.root,
      "--registry",
      "ghcr.io/owner/genie-ops-center",
    ]);

    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain("release failed at smoke-candidate");

    const log = readFileSync(workspace.log, "utf8");

    // Gates and the build ran; the smoke's own failure stops the run before any
    // tag or push, which is the wrapper-level version of the pipeline's
    // smoke-only failure.
    expect(log).toContain("docker build");
    expect(log).toContain("release-smoke");
    expect(log).not.toContain("docker tag");
    expect(log).not.toContain("docker push");
  });

  it("prints a failed gate's captured output before the status line", () => {
    const workspace = stubWorkspace(1);

    const outcome = runCli(workspace, [
      "acme",
      "1.2.3",
      "--repo-root",
      workspace.root,
      "--registry",
      "ghcr.io/owner/genie-ops-center",
    ]);

    expect(outcome.status).toBe(1);

    const gateAt = outcome.stderr.indexOf("gate stderr marker");
    const statusAt = outcome.stderr.indexOf("release failed at typecheck");

    // Both halves of the failure reach the log, in the order a reader needs:
    // the gate's own output first, the status line that concludes it after.
    expect(gateAt).toBeGreaterThan(-1);
    expect(outcome.stderr).toContain("gate stdout marker");
    expect(statusAt).toBeGreaterThan(gateAt);
  });

  it("flushes the whole tail and the status line when the gate is chatty", () => {
    // One gate line far larger than a pipe buffer. A runner that exits before
    // its stderr drains loses the tail and the status line together, which is
    // exactly the blindness this Bead exists to remove.
    const workspace = stubWorkspace(
      1,
      "head -c 200000 /dev/zero | tr '\\0' 'x'; printf '\\n'"
    );

    const outcome = runCli(workspace, [
      "acme",
      "1.2.3",
      "--repo-root",
      workspace.root,
      "--registry",
      "ghcr.io/owner/genie-ops-center",
    ]);

    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain("xxxx");
    expect(outcome.stderr).toContain("release failed at typecheck");
  });

  it("publishes nothing for a missing customer", () => {
    const workspace = stubWorkspace(0);

    const outcome = runCli(workspace, [
      "does-not-exist",
      "1.2.3",
      "--repo-root",
      workspace.root,
    ]);

    expect(outcome.status).toBe(1);
    expect(readFileSync(workspace.log, "utf8")).not.toContain("docker push");
  });

  // genie-ops-center-v2-sl1: the release workflow splits verify from publish so
  // the registry credential is written only for the publish step. The verify
  // run writes the identity it smoked to --identity-out, and a later run
  // publishes exactly that identity with --publish-digest.
  it("writes the smoked identity to --identity-out and publishes nothing", () => {
    const workspace = stubWorkspace(0);
    const identityOut = join(workspace.root, "candidate-identity");

    const outcome = runCli(workspace, [
      "acme",
      "1.2.3",
      "--repo-root",
      workspace.root,
      "--registry",
      "ghcr.io/owner/genie-ops-center",
      "--no-publish",
      "--identity-out",
      identityOut,
    ]);

    expect(outcome.status, outcome.stderr).toBe(0);
    expect(readFileSync(identityOut, "utf8").trim()).toBe(IDENTITY);

    const log = readFileSync(workspace.log, "utf8");

    expect(log).toContain("docker build");
    expect(log).toContain("release-smoke");
    expect(log).not.toContain("docker push");
  });

  it("publishes a verified digest without rebuilding or re-running the gates", () => {
    const workspace = stubWorkspace(0);

    const outcome = runCli(workspace, [
      "acme",
      "1.2.3",
      "--repo-root",
      workspace.root,
      "--registry",
      "ghcr.io/owner/genie-ops-center",
      "--publish-digest",
      IDENTITY,
    ]);

    expect(outcome.status, outcome.stderr).toBe(0);

    const log = readFileSync(workspace.log, "utf8");

    // The publish run touches the registry only: no gate, no build, no smoke.
    // `docker buildx imagetools` is the promotion, not the candidate build.
    expect(log).not.toContain("docker build -f");
    expect(log).not.toContain("release-smoke");
    expect(log).not.toContain("pnpm");
    expect(log).toContain(`docker tag ${IDENTITY} `);
    expect(log).toContain("docker push");
  });

  it("fails closed when --publish-digest is not an immutable digest", () => {
    const workspace = stubWorkspace(0);

    const outcome = runCli(workspace, [
      "acme",
      "1.2.3",
      "--repo-root",
      workspace.root,
      "--registry",
      "ghcr.io/owner/genie-ops-center",
      "--publish-digest",
      "acme:latest",
    ]);

    expect(outcome.status).toBe(1);
    expect(outcome.stderr).toContain("release failed at resolve-identity");
    expect(readFileSync(workspace.log, "utf8")).not.toContain("docker push");
  });
});
