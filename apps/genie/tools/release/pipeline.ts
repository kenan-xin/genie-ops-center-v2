import { existsSync } from "node:fs";
import { join } from "node:path";

import { readModuleInventory, readModulesFile } from "@genie/generators";

/** One command the pipeline runs, with its working directory and environment. */
export type CommandRunner = (
  command: string,
  args: readonly string[],
  options: {
    readonly cwd: string;
    readonly env?: Readonly<Record<string, string>>;
  }
) => {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
};

export type ReleaseRequest = {
  /** The customer slug; its deployment files live at `customers/<slug>/deploy`. */
  readonly slug: string;
  readonly version: string;
  readonly repoRoot: string;
  /** The registry repository prefix, for example `ghcr.io/owner/genie-ops-center`. */
  readonly registry: string;
  /** Whether the authorized, non-cacheable push runs. Off proves ordering only. */
  readonly publish: boolean;
  /**
   * The publish boundary a local/test sink replaces. Its argv is extended with
   * the resolved immutable identity and the published ref, in that order, so a
   * sink can prove it received the exact candidate smoke verified.
   */
  readonly publishCommand?: readonly string[] | undefined;
  /** The smoke boundary a local/test stub replaces, run with the image digest. */
  readonly smokeCommand?: readonly string[] | undefined;
  /**
   * R-55: with no customer folder, the release builds the default every-module
   * image instead. `slug` is ignored and the published ref is tagged
   * `development`, so this image is never mistaken for a customer deliverable.
   */
  readonly developmentFallback?: boolean;
};

export type ReleaseOutcome = {
  readonly ok: boolean;
  /** The immutable image identity smoke verified and publish consumes. */
  readonly identity?: string;
  readonly publishedRef?: string;
  readonly failedStep?: string;
  readonly reason?: string;
};

/** The digest shape `docker image inspect -f {{.Id}}` prints for a real image. */
const IMMUTABLE_IDENTITY = /^sha256:[0-9a-f]{64}$/;

/**
 * Docker tag components allow only `[A-Za-z0-9_.-]`, so a version or slug that
 * carries anything else would produce an invalid reference. Reject rather than
 * rewrite: a silently normalized release tag is not the one that was asked for.
 */
function tagComponent(value: string, label: string): string {
  if (!/^[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error(
      `The ${label} "${value}" contains a character a Docker tag cannot carry.`
    );
  }

  return value;
}

const NX = "pnpm";

function nxArgs(target: string): readonly string[] {
  return ["exec", "nx", "run", target, "--skip-nx-cache"];
}

function fail(failedStep: string, reason: string): ReleaseOutcome {
  return { ok: false, failedStep, reason };
}

/**
 * The customer image release pipeline, in the order R-34/R-51/R-52/R-53 fix.
 *
 * Every gate runs before the candidate is built; the candidate is built, its
 * immutable identity is resolved, and that identity is what the smoke verifier
 * boots and what publish consumes. A failure at any step stops the pipeline, so
 * no publish command can run after a failed smoke, typecheck, test, README or
 * module-tests check, or a skipped isolation run.
 *
 * This function never touches a registry by itself: publishing is a separate,
 * authorized step, and a local sink replaces it exactly here.
 */
export function runRelease(
  request: ReleaseRequest,
  runner: CommandRunner
): ReleaseOutcome {
  let include: string;

  if (request.developmentFallback === true) {
    // R-55: no customer folder exists yet, so the default every-module image is
    // built and pushed. The effective list is spelled explicitly, because the
    // image build cannot distinguish an absent variable from an empty one; the
    // result is every module the inventory holds, which is what the default
    // selection resolves to.
    include = readModuleInventory(request.repoRoot)
      .map((entry) => entry.id)
      .join(",");
  } else {
    const modulesFile = join(
      request.repoRoot,
      "customers",
      request.slug,
      "deploy",
      "modules.txt"
    );

    if (!existsSync(modulesFile)) {
      return fail(
        "resolve-customer",
        `No customer modules file at ${modulesFile}. A release is built from an explicit include list, never the default selection.`
      );
    }

    include = readModulesFile(modulesFile);
  }

  const env = { MODULE_INCLUDE: include };

  // The effective excluded set, so the candidate smoke can prove the excluded
  // modules have no route, table or ledger and no artifact in this exact image.
  const includedIds = include
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");

  const includedSet = new Set(includedIds);

  const excludedIds = readModuleInventory(request.repoRoot)
    .map((entry) => entry.id)
    .filter((id) => !includedSet.has(id));

  const gates: readonly (readonly [string, string, readonly string[]])[] = [
    ["typecheck", "@genie/app:typecheck", nxArgs("@genie/app:typecheck")],
    [
      "validate",
      "@genie/generators:validate",
      nxArgs("@genie/generators:validate"),
    ],
    ["test", "@genie/app:test", nxArgs("@genie/app:test")],
    [
      "integration",
      "@genie/app:test:integration",
      nxArgs("@genie/app:test:integration"),
    ],
  ];

  for (const [step, label, args] of gates) {
    const result = runner(NX, args, { cwd: request.repoRoot, env });

    if (result.status !== 0) {
      return fail(
        step,
        `${label} failed with exit ${result.status}. The candidate is not built and nothing is published.`
      );
    }
  }

  // The development fallback is never published under a customer's name.
  const label =
    request.developmentFallback === true ? "development" : request.slug;

  const candidateTag = `genie-release-candidate:${tagComponent(
    label,
    "slug"
  )}-${tagComponent(request.version, "version")}`;

  const built = runner(
    "docker",
    [
      "build",
      "-f",
      "deploy/Dockerfile",
      "--build-arg",
      `MODULE_INCLUDE=${include}`,
      "-t",
      candidateTag,
      ".",
    ],
    { cwd: request.repoRoot, env }
  );

  if (built.status !== 0) {
    return fail(
      "build-candidate",
      `The candidate build failed with exit ${built.status}. Nothing is published.`
    );
  }

  const inspected = runner(
    "docker",
    ["image", "inspect", "-f", "{{.Id}}", candidateTag],
    { cwd: request.repoRoot }
  );

  const identity = inspected.stdout.trim();

  if (inspected.status !== 0 || !IMMUTABLE_IDENTITY.test(identity)) {
    return fail(
      "resolve-identity",
      `Could not resolve an immutable digest for ${candidateTag} (saw "${identity}"). Publishing a movable tag would not be the smoke-tested candidate, so this fails closed.`
    );
  }

  const smokeCommand = request.smokeCommand ?? [
    "pnpm",
    "exec",
    "vitest",
    "run",
    "--config",
    "vitest.release-smoke.config.ts",
  ];

  const smoked = runner(smokeCommand[0] ?? "pnpm", smokeCommand.slice(1), {
    cwd: join(request.repoRoot, "apps/genie"),
    // The smoke scans this exact candidate against the effective selection, so
    // the include list travels with the identity.
    env: {
      ...env,
      GENIE_SMOKE_IMAGE: identity,
      GENIE_SMOKE_INCLUDE: include,
      GENIE_SMOKE_EXCLUDED: excludedIds.join(","),
    },
  });

  if (smoked.status !== 0) {
    return fail(
      "smoke-candidate",
      `The candidate ${identity} failed its smoke check with exit ${smoked.status}. A failed or unverifiable smoke blocks publication.`
    );
  }

  if (!request.publish) {
    return { ok: true, identity };
  }

  const publishedRef = `${request.registry}:${tagComponent(
    label,
    "slug"
  )}-${tagComponent(request.version, "version")}`;

  if (request.publishCommand !== undefined) {
    const [command, ...head] = request.publishCommand;

    if (command === undefined) {
      return fail(
        "publish-candidate",
        "The publish command override is empty."
      );
    }

    const sunk = runner(command, [...head, identity, publishedRef], {
      cwd: request.repoRoot,
      env,
    });

    if (sunk.status !== 0) {
      return fail(
        "publish-candidate",
        `The publish sink failed with exit ${sunk.status}.`
      );
    }

    return { ok: true, identity, publishedRef };
  }

  // The exact identity is tagged and pushed in the same step, so the pushed ref
  // is bound to the candidate digest rather than to whatever the tag held before
  // this run resolved it.
  //
  // Residual, tracked as genie-ops-center-v2-3aa: `docker tag` and `docker push`
  // are two commands, so a second process with Docker access can retag the ref
  // between them. Closing that needs registry-side promotion by digest, which
  // needs registry access this ticket does not have; real publication is
  // separately authorized. The supported bound is one local writer per registry.
  const tagged = runner("docker", ["tag", identity, publishedRef], {
    cwd: request.repoRoot,
  });

  if (tagged.status !== 0) {
    return fail(
      "publish-candidate",
      "Tagging the smoke-tested identity failed."
    );
  }

  const pushed = runner("docker", ["push", publishedRef], {
    cwd: request.repoRoot,
    env,
  });

  if (pushed.status !== 0) {
    return fail(
      "publish-candidate",
      `The push of ${publishedRef} failed with exit ${pushed.status}.`
    );
  }

  return { ok: true, identity, publishedRef };
}
