import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  runRelease,
  type CommandRunner,
  type ReleaseRequest,
} from "./pipeline.ts";

const IDENTITY = `sha256:${"a".repeat(64)}`;

const temporary: string[] = [];

function repoWithModules(contents: string | undefined): string {
  const root = mkdtempSync(join(tmpdir(), "genie-release-"));

  temporary.push(root);

  if (contents !== undefined) {
    const deploy = join(root, "customers/acme/deploy");

    mkdirSync(deploy, { recursive: true });
    writeFileSync(join(deploy, "modules.txt"), contents, "utf8");
  }

  return root;
}

type Call = {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Record<string, string> | undefined;
};

/** The pipeline step a recorded command belongs to, most specific first. */
type Step =
  | "typecheck"
  | "validate"
  | "test"
  | "integration"
  | "build"
  | "smoke"
  | "publish";

function stepOf(command: string, args: readonly string[]): Step | undefined {
  const line = `${command} ${args.join(" ")}`;

  if (command === "docker" && args[0] === "build") return "build";

  if (command === "docker" && (args[0] === "tag" || args[0] === "push"))
    return "publish";

  if (line.includes("app:test:integration")) return "integration";

  if (line.includes("release-smoke")) return "smoke";

  if (line.includes("app:typecheck")) return "typecheck";

  if (line.includes("workspace-validation:validate")) return "validate";

  if (line.includes("app:test")) return "test";

  return undefined;
}

/**
 * A runner that records every invocation and fails exactly the steps named in
 * `failures`. A real `docker build` writes the image id to the path given by
 * `--iidfile`, so the stub writes the canned digest to that same path and the
 * pipeline's own read of the file runs for real.
 */
function recordingRunner(
  failures: readonly Step[] = [],
  identity: string | undefined = IDENTITY
) {
  const calls: Call[] = [];
  const failed = new Set(failures);

  const runner: CommandRunner = (command, args, options) => {
    const call: Call = { command, args: [...args], env: options.env };

    calls.push(call);

    const step = stepOf(command, args);
    const status = step !== undefined && failed.has(step) ? 1 : 0;

    if (step === "build" && status === 0) {
      const iidAt = args.indexOf("--iidfile");
      const path = iidAt === -1 ? undefined : args[iidAt + 1];

      if (path !== undefined) {
        writeFileSync(path, `${identity ?? ""}\n`, "utf8");
      }
    }

    return { status, stdout: "", stderr: status === 0 ? "" : "failed" };
  };

  return { calls, runner };
}

function request(root: string, overrides: Partial<ReleaseRequest> = {}) {
  return {
    slug: "acme",
    version: "1.2.3",
    repoRoot: root,
    registry: "ghcr.io/owner/genie-ops-center",
    publish: true,
    ...overrides,
  } satisfies ReleaseRequest;
}

const steps = (calls: readonly Call[]) =>
  calls.map((call) => stepOf(call.command, call.args));

const has = (calls: readonly Call[], step: Step) => steps(calls).includes(step);

afterEach(() => {
  for (const path of temporary.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("the customer image release pipeline", () => {
  it("reads modules.txt, builds that exact selection, and pushes the smoke-tested identity", () => {
    const root = repoWithModules("placeholder\n");
    const { calls, runner } = recordingRunner();

    const outcome = runRelease(request(root), runner);

    expect(outcome.ok).toBe(true);

    const build = calls.find(
      (call) => stepOf(call.command, call.args) === "build"
    );

    expect(build?.args).toContain("MODULE_INCLUDE=placeholder");
    expect(build?.env?.MODULE_INCLUDE).toBe("placeholder");

    // The identity comes from the build's iidfile, never from inspecting the
    // movable candidate tag.
    const iidAt = build?.args.indexOf("--iidfile") ?? -1;

    expect(iidAt).toBeGreaterThan(-1);
    expect(
      calls.some(
        (call) =>
          call.command === "docker" &&
          call.args[0] === "image" &&
          call.args[1] === "inspect"
      )
    ).toBe(false);

    // Publish consumes the immutable identity, never the tag, which can move.
    const tag = calls.find((call) => call.args[0] === "tag");

    expect(tag?.args[1]).toBe(IDENTITY);

    expect(calls.some((call) => call.args[0] === "push")).toBe(true);

    // Smoke runs on the identity and strictly before the push, and it receives
    // the effective selection so it can scan the candidate for the excluded set.
    const smokeAt = steps(calls).indexOf("smoke");
    const pushAt = calls.findIndex((call) => call.args[0] === "push");

    expect(smokeAt).toBeGreaterThan(-1);
    expect(pushAt).toBeGreaterThan(smokeAt);

    const smoke = calls[smokeAt];

    expect(smoke?.env?.GENIE_SMOKE_IMAGE).toBe(IDENTITY);
    expect(smoke?.env?.GENIE_SMOKE_INCLUDE).toBe("placeholder");
    expect(smoke?.env?.GENIE_SMOKE_EXCLUDED).toBe("");
  });

  it("resolves the identity from the build's iidfile and removes the temp file", () => {
    const root = repoWithModules("placeholder\n");
    const { calls, runner } = recordingRunner();

    const outcome = runRelease(request(root), runner);

    expect(outcome.ok).toBe(true);
    expect(outcome.identity).toBe(IDENTITY);

    const build = calls.find(
      (call) => stepOf(call.command, call.args) === "build"
    );

    const iidAt = build?.args.indexOf("--iidfile") ?? -1;

    expect(iidAt).toBeGreaterThan(-1);

    const iidPath = build?.args[iidAt + 1] ?? "";

    expect(iidPath).not.toBe("");

    // Smoke and publish both consume the digest the build wrote to that exact
    // path, so the identity is the build's own output and not a tag's current
    // target.
    expect(calls.find((call) => call.args[0] === "tag")?.args[1]).toBe(
      IDENTITY
    );

    const smoke = calls.find(
      (call) => stepOf(call.command, call.args) === "smoke"
    );

    expect(smoke?.env?.GENIE_SMOKE_IMAGE).toBe(IDENTITY);

    // The temp file the build wrote is gone once the run returns.
    expect(existsSync(iidPath)).toBe(false);
  });

  it("changes the build argument when the customer's modules.txt changes", () => {
    const first = recordingRunner();
    const second = recordingRunner();

    runRelease(request(repoWithModules("placeholder\n")), first.runner);
    runRelease(request(repoWithModules("other\n")), second.runner);

    const argOf = (calls: readonly Call[]) =>
      calls
        .find((call) => stepOf(call.command, call.args) === "build")
        ?.args.find((arg) => arg.startsWith("MODULE_INCLUDE="));

    expect(argOf(first.calls)).toBe("MODULE_INCLUDE=placeholder");
    expect(argOf(second.calls)).toBe("MODULE_INCLUDE=other");
  });

  it("treats an empty modules.txt as an explicit empty selection, not the default", () => {
    const { calls, runner } = recordingRunner();

    const outcome = runRelease(request(repoWithModules("")), runner);

    expect(outcome.ok).toBe(true);

    const build = calls.find(
      (call) => stepOf(call.command, call.args) === "build"
    );

    expect(build?.args).toContain("MODULE_INCLUDE=");
    expect(build?.env?.MODULE_INCLUDE).toBe("");
  });

  it("fails before any docker command when the customer has no modules.txt", () => {
    const { calls, runner } = recordingRunner();

    const outcome = runRelease(request(repoWithModules(undefined)), runner);

    expect(outcome.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it.each([
    ["a failed per-customer typecheck", "typecheck"],
    [
      "a failed repository validate (missing README or a module with no tests)",
      "validate",
    ],
    ["a failed unit test", "test"],
    ["a skipped isolation run", "integration"],
  ] as const)("does not build or publish after %s", (_label, step) => {
    const root = repoWithModules("placeholder\n");
    const { calls, runner } = recordingRunner([step]);

    const outcome = runRelease(request(root), runner);

    expect(outcome.ok).toBe(false);
    expect(calls.some((call) => call.args[0] === "push")).toBe(false);
    expect(has(calls, "build")).toBe(false);
  });

  // The S0-11 injected-failure acceptance: each failure, against both publish
  // boundaries (docker tag + push, and the local sink the release tests use),
  // runs no publish command at all.
  const SINK = ["node", "tools/release/local-sink.ts"] as const;

  it.each(
    (
      ["typecheck", "validate", "test", "integration", "smoke"] as const
    ).flatMap(
      (step) =>
        [
          [step, "docker"],
          [step, "sink"],
        ] as const
    )
  )(
    "runs no publish command after a failed %s, with the %s boundary",
    (step, boundary) => {
      const root = repoWithModules("placeholder\n");
      const { calls, runner } = recordingRunner([step]);

      const outcome = runRelease(
        request(root, boundary === "sink" ? { publishCommand: [...SINK] } : {}),
        runner
      );

      expect(outcome.ok).toBe(false);
      expect(has(calls, "publish")).toBe(false);
      expect(calls.some((call) => call.args.includes(SINK[1]))).toBe(false);
    }
  );

  it("does not publish when the candidate smoke fails", () => {
    const root = repoWithModules("placeholder\n");
    const { calls, runner } = recordingRunner(["smoke"]);

    const outcome = runRelease(request(root), runner);

    expect(outcome.ok).toBe(false);
    expect(calls.some((call) => call.args[0] === "push")).toBe(false);
    // It did build and smoke, so the failure is the smoke, not an earlier gate.
    expect(has(calls, "build")).toBe(true);
  });

  it("reports a bounded, redacted tail of a failed gate's captured output", () => {
    const root = repoWithModules("placeholder\n");

    // The head of each stream is longer than the tail that is kept, so a case
    // that forgot to bound would carry the head and fail the absence below.
    const stdoutHead = Array.from({ length: 300 }, (_, i) => `out ${i}`);
    const stderrHead = Array.from({ length: 300 }, (_, i) => `err ${i}`);

    const runner: CommandRunner = (command, args) =>
      stepOf(command, args) === "typecheck"
        ? {
            status: 1,
            stdout: `${stdoutHead.join("\n")}\nDATABASE_URL=postgres://u:hunter2@db/app\nrejected Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc123\n`,
            stderr: `${stderrHead.join("\n")}\n`,
          }
        : { status: 0, stdout: "", stderr: "" };

    const outcome = runRelease(request(root), runner);

    expect(outcome.ok).toBe(false);

    // Both streams keep their tail...
    expect(outcome.gateOutput).toContain("out 299");
    expect(outcome.gateOutput).toContain("err 299");

    // ...and drop their head, so a chatty gate cannot bury the status line.
    expect(outcome.gateOutput).not.toContain("out 0\n");
    expect(outcome.gateOutput).not.toContain("err 0\n");

    // A credential the gate printed never reaches the release log.
    expect(outcome.gateOutput).not.toContain("hunter2");
    // ...including a bearer token it captured without a `name=value` pair around it.
    expect(outcome.gateOutput).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(outcome.gateOutput).toContain("[redacted]");
  });

  it("carries no gate output when the gate succeeds", () => {
    const root = repoWithModules("placeholder\n");
    const { runner } = recordingRunner();

    const outcome = runRelease(request(root), runner);

    expect(outcome.ok).toBe(true);
    expect(outcome.gateOutput).toBeUndefined();
  });

  it("fails closed when the build's iidfile is not an immutable digest", () => {
    const root = repoWithModules("placeholder\n");
    const { calls, runner } = recordingRunner([], "acme:latest");

    const outcome = runRelease(request(root), runner);

    expect(outcome.ok).toBe(false);
    expect(calls.some((call) => call.args[0] === "push")).toBe(false);
  });

  it("runs the gates, build and smoke but publishes nothing when publish is off", () => {
    const root = repoWithModules("placeholder\n");
    const { calls, runner } = recordingRunner();

    const outcome = runRelease(request(root, { publish: false }), runner);

    expect(outcome.ok).toBe(true);
    expect(has(calls, "build")).toBe(true);
    expect(calls.some((call) => call.args[0] === "push")).toBe(false);
    // The identity is still resolved and reported, so a later authorized step
    // can publish exactly this candidate.
    expect(outcome.publishedRef).toBeUndefined();
    expect(outcome.identity).toBe(IDENTITY);
  });

  it("builds the every-module image and tags it development when no customer exists", () => {
    // R-55: no `customers/` folder at all. The fallback must not fail on the
    // missing modules.txt; it selects every module the inventory holds and
    // publishes under a `development` tag, never a customer name.
    const root = mkdtempSync(join(tmpdir(), "genie-release-fallback-"));

    temporary.push(root);

    mkdirSync(join(root, "packages/modules/placeholder/src"), {
      recursive: true,
    });
    writeFileSync(
      join(root, "packages/modules/placeholder/package.json"),
      JSON.stringify({
        name: "@genie/module-placeholder",
        genie: { module: { id: "placeholder", entrypoint: "src/index.ts" } },
      }),
      "utf8"
    );
    writeFileSync(
      join(root, "packages/modules/placeholder/src/index.ts"),
      "export {};\n",
      "utf8"
    );

    const { calls, runner } = recordingRunner();

    const outcome = runRelease(
      request(root, { developmentFallback: true, slug: "development" }),
      runner
    );

    expect(outcome.ok).toBe(true);
    expect(calls.find((call) => call.args[0] === "build")?.args).toContain(
      "MODULE_INCLUDE=placeholder"
    );
    expect(outcome.publishedRef).toContain(":development-1.2.3");
  });

  it("drives the publish boundary through an injected local sink", () => {
    const root = repoWithModules("placeholder\n");
    const { calls, runner } = recordingRunner();

    const outcome = runRelease(
      request(root, {
        publishCommand: ["node", "tools/release/local-sink.ts"],
      }),
      runner
    );

    expect(outcome.ok).toBe(true);

    const sink = calls.filter((call) => call.command === "node");

    expect(sink).toHaveLength(1);
    expect(sink[0]?.args[0]).toBe("tools/release/local-sink.ts");
    expect(sink[0]?.args).toContain(IDENTITY);
    expect(sink[0]?.args).toContain(outcome.publishedRef);

    // The docker push never ran: the sink is the whole publish boundary.
    expect(calls.some((call) => call.args[0] === "push")).toBe(false);
  });
});

/**
 * The manifest digest the registry reports for the pushed temporary ref. It is
 * the manifest's digest, which is not the image id (the config digest) the
 * build wrote to the iidfile; promotion and verification are what connect them.
 */
const REGISTRY_MANIFEST = `sha256:${"c".repeat(64)}`;

function inspectManifest(configDigest: string): string {
  return JSON.stringify({
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    config: {
      mediaType: "application/vnd.oci.image.config.v1+json",
      digest: configDigest,
      size: 768,
    },
    layers: [],
  });
}

/**
 * A runner for the publish-by-digest contract. Gates, build and smoke come
 * from `recordingRunner`; the docker publish phase is answered the way a real
 * daemon and registry behave: a push reports the pushed manifest's digest, and
 * `imagetools inspect` returns a manifest whose config digest is the image id.
 */
function registryRunner(
  failure: "tag" | "push" | "create" | "inspect" | undefined = undefined,
  configDigest: string = IDENTITY
) {
  const inner = recordingRunner();
  const calls = inner.calls;

  const runner: CommandRunner = (command, args, options) => {
    const line = `${command} ${args.join(" ")}`;

    const phase =
      command === "docker" && args[0] === "tag"
        ? "tag"
        : command === "docker" && args[0] === "push"
          ? "push"
          : line.startsWith("docker buildx imagetools create")
            ? "create"
            : line.startsWith("docker buildx imagetools inspect")
              ? "inspect"
              : undefined;

    if (phase === undefined) {
      return inner.runner(command, args, options);
    }

    calls.push({ command, args: [...args], env: options.env });

    if (phase === failure) {
      return { status: 1, stdout: "", stderr: `${phase} failed` };
    }

    if (phase === "push") {
      return {
        status: 0,
        stdout: `latest: digest: ${REGISTRY_MANIFEST} size: 528\n`,
        stderr: "",
      };
    }

    if (phase === "inspect") {
      return { status: 0, stdout: inspectManifest(configDigest), stderr: "" };
    }

    return { status: 0, stdout: "", stderr: "" };
  };

  return { calls, runner };
}

describe("publishing the stable tag by digest", () => {
  const PUBLISHED_REF = "ghcr.io/owner/genie-ops-center:acme-1.2.3";

  it("pushes a unique temporary ref, then creates the stable tag from the registry digest and verifies it", () => {
    const root = repoWithModules("placeholder\n");
    const { calls, runner } = registryRunner();

    const outcome = runRelease(request(root), runner);

    expect(outcome.ok).toBe(true);
    expect(outcome.publishedRef).toBe(PUBLISHED_REF);

    // The stable published ref is never tagged or pushed directly: the push
    // carries a temporary ref, so the uploaded bytes are bound to the one ref
    // no other writer holds, and a retag between the steps cannot change them.
    const tags = calls.filter((call) => call.args[0] === "tag");
    const pushes = calls.filter((call) => call.args[0] === "push");

    expect(tags).toHaveLength(1);
    expect(pushes).toHaveLength(1);
    expect(tags[0]?.args[1]).toBe(IDENTITY);
    expect(tags[0]?.args[2]).not.toBe(PUBLISHED_REF);
    expect(pushes[0]?.args[1]).not.toBe(PUBLISHED_REF);

    // The pushed ref is the temporary tag the smoke-tested identity received.
    expect(pushes[0]?.args[1]).toBe(tags[0]?.args[2]);

    // A second run must not reuse the first run's temporary ref, or a
    // concurrent run could retag it exactly like the stable one.
    const second = registryRunner();

    runRelease(request(repoWithModules("placeholder\n")), second.runner);

    const secondPush = second.calls.find((call) => call.args[0] === "push");

    expect(secondPush?.args[1]).toBeDefined();
    expect(secondPush?.args[1]).not.toBe(pushes[0]?.args[1]);

    // The stable tag is created registry-side from the digest the push
    // reported, as `<repo>@<manifest digest>`, not from any local ref.
    const createAt = calls.findIndex(
      (call) => call.args[0] === "buildx" && call.args[2] === "create"
    );

    expect(createAt).toBeGreaterThan(-1);

    const create = calls[createAt];

    expect(create?.args).toContain("--tag");
    expect(create?.args).toContain(PUBLISHED_REF);
    expect(create?.args).toContain(
      `ghcr.io/owner/genie-ops-center@${REGISTRY_MANIFEST}`
    );
    expect(calls.findIndex((call) => call.args[0] === "push")).toBeLessThan(
      createAt
    );

    // The published tag is inspected and its config digest must equal the
    // smoke-tested identity before the run reports success.
    const inspectAt = calls.findIndex(
      (call) => call.args[0] === "buildx" && call.args[2] === "inspect"
    );

    expect(inspectAt).toBeGreaterThan(createAt);
    expect(calls[inspectAt]?.args.join(" ")).toContain(PUBLISHED_REF);
  });

  it("fails and publishes nothing further when the published tag's config digest differs from the smoke-tested identity", () => {
    const root = repoWithModules("placeholder\n");

    const { calls, runner } = registryRunner(
      undefined,
      `sha256:${"d".repeat(64)}`
    );

    const outcome = runRelease(request(root), runner);

    expect(outcome.ok).toBe(false);
    expect(outcome.failedStep).toBe("publish-candidate");

    // Verification is the last word: after the published tag failed to match,
    // no tag, push or promotion runs again.
    const inspectAt = calls.findIndex(
      (call) => call.args[0] === "buildx" && call.args[2] === "inspect"
    );

    expect(inspectAt).toBeGreaterThan(-1);
    expect(
      calls
        .slice(inspectAt + 1)
        .some(
          (call) =>
            call.args[0] === "tag" ||
            call.args[0] === "push" ||
            call.args[0] === "buildx"
        )
    ).toBe(false);
  });

  it("creates no stable tag when the push of the temporary ref fails", () => {
    const root = repoWithModules("placeholder\n");
    const { calls, runner } = registryRunner("push");

    const outcome = runRelease(request(root), runner);

    expect(outcome.ok).toBe(false);
    expect(outcome.failedStep).toBe("publish-candidate");
    expect(calls.some((call) => call.args[0] === "buildx")).toBe(false);
  });

  it("fails the release when creating the stable tag by digest fails", () => {
    const root = repoWithModules("placeholder\n");
    const { calls, runner } = registryRunner("create");

    const outcome = runRelease(request(root), runner);

    expect(outcome.ok).toBe(false);
    expect(outcome.failedStep).toBe("publish-candidate");

    // The push happened, but with the promotion failed the published tag was
    // never created, so nothing is verified or reported as published.
    expect(calls.some((call) => call.args[0] === "push")).toBe(true);
    expect(
      calls.some(
        (call) => call.args[0] === "buildx" && call.args[2] === "inspect"
      )
    ).toBe(false);
  });
});
