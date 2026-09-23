import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  | "identity"
  | "smoke"
  | "publish";

function stepOf(command: string, args: readonly string[]): Step | undefined {
  const line = `${command} ${args.join(" ")}`;

  if (command === "docker" && args[0] === "build") return "build";

  if (command === "docker" && args[0] === "image" && args[1] === "inspect")
    return "identity";

  if (command === "docker" && (args[0] === "tag" || args[0] === "push"))
    return "publish";

  if (line.includes("app:test:integration")) return "integration";

  if (line.includes("release-smoke")) return "smoke";

  if (line.includes("app:typecheck")) return "typecheck";

  if (line.includes("generators:validate")) return "validate";

  if (line.includes("app:test")) return "test";

  return undefined;
}

/**
 * A runner that records every invocation and fails exactly the steps named in
 * `failures`. The identity probe answers the canned digest unless a case passes
 * a replacement, so the pipeline's own parsing of `docker image inspect` runs
 * for real.
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

    if (stepOf(command, args) === "identity") {
      return { status: 0, stdout: `${identity ?? ""}\n`, stderr: "" };
    }

    const step = stepOf(command, args);
    const status = step !== undefined && failed.has(step) ? 1 : 0;

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

  it("fails closed when the identity probe is not an immutable digest", () => {
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
