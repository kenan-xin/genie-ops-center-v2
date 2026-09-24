import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// `@genie/core` and `@genie/generators` are loaded with `await import()` in the
// build path only (genie-ops-center-v2-dwn). A promote run — a verified identity
// handed over from the verify job — must import nothing but `node:` builtins, so
// the job that holds the registry credential never executes dependency code at
// import time. A static import here would load ~25 packages into that job.

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
  /**
   * An immutable identity a prior run already gated, built and smoked. When
   * set, the gates, the build and the smoke are skipped and only the publish
   * runs, so the release workflow can hold the registry credential for the
   * publish step alone (genie-ops-center-v2-sl1). The value must still be a
   * `sha256:<64 hex>` digest or the run fails closed.
   */
  readonly verifiedIdentity?: string | undefined;
};

export type ReleaseOutcome = {
  readonly ok: boolean;
  /** The immutable image identity smoke verified and publish consumes. */
  readonly identity?: string;
  readonly publishedRef?: string;
  readonly failedStep?: string;
  readonly reason?: string;
  /**
   * The bounded, redacted tail of a failed gate's captured output, when a gate
   * failed. Present only on failure, so a successful run stays quiet; the CLI
   * prints it before the status line that names the failed step.
   */
  readonly gateOutput?: string;
};

/** The digest shape `docker build --iidfile` writes for a real image. */
const IMMUTABLE_IDENTITY = /^sha256:[0-9a-f]{64}$/;

/**
 * The manifest digest `docker push` reports for the ref it uploaded. The final
 * line of a push reads `<ref>: digest: sha256:<64 hex> size: <n>`; the manifest
 * digest is the registry-side name for the exact bytes this run pushed, which
 * is what the stable tag is then created from.
 */
const PUSHED_MANIFEST_DIGEST = /digest:\s*(sha256:[0-9a-f]{64})/;

/** The manifest digest a push reported, or `undefined` when it reported none. */
function parsePushedManifestDigest(stdout: string): string | undefined {
  return PUSHED_MANIFEST_DIGEST.exec(stdout)?.[1];
}

/**
 * The config digest a raw manifest names — the image id `docker build` writes
 * to its iidfile. The published tag is created with `--prefer-index=false`, so
 * a single-platform candidate inspects as one manifest whose `config.digest` is
 * the smoke-tested identity. An index carries no config, so this returns
 * `undefined` and the caller fails closed rather than trusting a shape it
 * cannot verify.
 */
function parseConfigDigest(rawManifest: string): string | undefined {
  let manifest: { config?: { digest?: string } };

  try {
    // SAFETY: the bytes are the raw manifest `docker buildx imagetools inspect
    // --raw` printed for the tag this run just created. The only field read is
    // `config.digest`, and it is checked against the immutable-digest shape
    // before use, so a manifest of any other shape fails closed.
    manifest = JSON.parse(rawManifest) as { config?: { digest?: string } };
  } catch {
    return undefined;
  }

  const digest = manifest.config?.digest;

  return digest !== undefined && IMMUTABLE_IDENTITY.test(digest)
    ? digest
    : undefined;
}

/**
 * How many trailing lines of a failed gate's captured output the release log
 * keeps. Enough to hold a stack trace and the lines that give it context, short
 * enough that a chatty gate cannot bury the status line printed after it.
 */
const GATE_OUTPUT_TAIL_LINES = 200;

/** The last `lines` lines of one captured stream, newline-joined. */
function tailLines(text: string, lines: number): string {
  const all = text.split("\n");

  return all.slice(Math.max(0, all.length - lines)).join("\n");
}

/**
 * A failed gate's captured stdout and stderr, each bounded to its own trailing
 * lines. The caller redacts the result with the build path's `redact`, so no
 * credential a gate printed (a database url, a token) reaches the release log.
 *
 * Each stream is bounded on its own so a long stdout cannot push a short
 * stderr's cause out of the log.
 */
function gateOutputTail(result: {
  readonly stdout: string;
  readonly stderr: string;
}): string {
  return [
    tailLines(result.stdout, GATE_OUTPUT_TAIL_LINES),
    tailLines(result.stderr, GATE_OUTPUT_TAIL_LINES),
  ]
    .filter((part) => part.trim() !== "")
    .join("\n");
}

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

function fail(
  failedStep: string,
  reason: string,
  gateOutput?: string
): ReleaseOutcome {
  // `exactOptionalPropertyTypes` forbids writing an explicit `undefined`, so an
  // absent tail omits the field rather than carrying one.
  return gateOutput === undefined
    ? { ok: false, failedStep, reason }
    : { ok: false, failedStep, reason, gateOutput };
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
export async function runRelease(
  request: ReleaseRequest,
  runner: CommandRunner
): Promise<ReleaseOutcome> {
  // The development fallback is never published under a customer's name.
  const label =
    request.developmentFallback === true ? "development" : request.slug;

  // A prior verify run already gated, built and smoked this exact identity, so
  // publish it without touching the gates, the build or the smoke again. The
  // release workflow splits the two runs so the registry credential exists only
  // for the publish job (genie-ops-center-v2-sl1). This branch runs before the
  // workspace imports below and `publish()` uses neither the include list nor a
  // package, so a promote run imports only `node:` builtins
  // (genie-ops-center-v2-dwn).
  if (request.verifiedIdentity !== undefined) {
    if (!IMMUTABLE_IDENTITY.test(request.verifiedIdentity)) {
      return fail(
        "resolve-identity",
        `The verified identity "${request.verifiedIdentity}" is not an immutable digest, so it cannot be published. This fails closed.`
      );
    }

    return request.publish
      ? publish(request, request.verifiedIdentity, label, {}, runner)
      : { ok: true, identity: request.verifiedIdentity };
  }

  // The build path is the only path that needs the workspace packages, so it is
  // the only one that loads them. `await import()` keeps them out of the
  // promote path's module graph; at this point the run has already passed the
  // verified-identity branch above.
  const [{ redact }, { readModuleInventory, readModulesFile }] =
    await Promise.all([import("@genie/core"), import("@genie/generators")]);

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
      "@genie/workspace-validation:validate",
      nxArgs("@genie/workspace-validation:validate"),
    ],
    ["test", "@genie/app:test", nxArgs("@genie/app:test")],
    [
      "integration",
      "@genie/app:test:integration",
      nxArgs("@genie/app:test:integration"),
    ],
  ];

  for (const [step, gateLabel, args] of gates) {
    const result = runner(NX, args, { cwd: request.repoRoot, env });

    if (result.status !== 0) {
      return fail(
        step,
        `${gateLabel} failed with exit ${result.status}. The candidate is not built and nothing is published.`,
        String(redact(gateOutputTail(result)))
      );
    }
  }

  const candidateTag = `genie-release-candidate:${tagComponent(
    label,
    "slug"
  )}-${tagComponent(request.version, "version")}`;

  // The build writes its own image id to this file, so the identity the smoke
  // and publish consume is the build's own output rather than whatever a
  // movable candidate tag currently points at.
  const iidDir = mkdtempSync(join(tmpdir(), "genie-release-iid-"));
  const iidFile = join(iidDir, "iid");

  let identity = "";

  try {
    const built = runner(
      "docker",
      [
        "build",
        "-f",
        "deploy/Dockerfile",
        "--build-arg",
        `MODULE_INCLUDE=${include}`,
        "--iidfile",
        iidFile,
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

    identity = existsSync(iidFile) ? readFileSync(iidFile, "utf8").trim() : "";
  } finally {
    rmSync(iidDir, { recursive: true, force: true });
  }

  if (!IMMUTABLE_IDENTITY.test(identity)) {
    return fail(
      "resolve-identity",
      `The build's iidfile held "${identity}", not an immutable digest. Publishing a movable tag would not be the smoke-tested candidate, so this fails closed.`
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

  return publish(request, identity, label, env, runner);
}

/**
 * The publish half of the pipeline, split out so a later run can publish an
 * identity an earlier verify run already gated, built and smoked
 * (genie-ops-center-v2-sl1). It touches no registry credential of its own: the
 * caller's step holds the login, and this only issues the docker commands.
 */
function publish(
  request: ReleaseRequest,
  identity: string,
  label: string,
  env: Readonly<Record<string, string>>,
  runner: CommandRunner
): ReleaseOutcome {
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

  // Publish by digest, not by tag. `docker tag` then `docker push` is two
  // commands, so a second process with Docker access can retag the published ref
  // between them and the push would carry bytes the smoke never saw. Instead the
  // smoke-tested identity is tagged with a run-unique temporary ref and pushed
  // under it; the stable tag is then created registry-side from the manifest
  // digest that push reported, and inspected to prove its config digest is the
  // smoke-tested identity. The stable ref is never tagged or pushed directly, so
  // no local writer can move the bytes under it.
  //
  // The temporary ref is left in the registry as an extra, run-unique tag. No
  // registry delete follows: the release must not depend on a second,
  // separately authorized registry mutation, and an untagged leftover costs
  // nothing a cleanup job cannot reclaim.
  const temporaryRef = `${request.registry}:genie-release-tmp-${tagComponent(
    label,
    "slug"
  )}-${tagComponent(request.version, "version")}-${randomUUID()}`;

  const tagged = runner("docker", ["tag", identity, temporaryRef], {
    cwd: request.repoRoot,
  });

  if (tagged.status !== 0) {
    return fail(
      "publish-candidate",
      "Tagging the smoke-tested identity with a run-unique temporary ref failed."
    );
  }

  const pushed = runner("docker", ["push", temporaryRef], {
    cwd: request.repoRoot,
    env,
  });

  if (pushed.status !== 0) {
    return fail(
      "publish-candidate",
      `The push of the temporary ref failed with exit ${pushed.status}. The published ref is not created from unverified bytes.`
    );
  }

  const manifestDigest = parsePushedManifestDigest(pushed.stdout);

  if (manifestDigest === undefined) {
    return fail(
      "publish-candidate",
      `The push of ${temporaryRef} reported no manifest digest, so ${publishedRef} cannot be created by digest. This fails closed.`
    );
  }

  // `--prefer-index=false` keeps a single-platform candidate a single manifest,
  // so the published tag inspects as a manifest whose `config.digest` is the
  // image id, not as an index that carries no config.
  const created = runner(
    "docker",
    [
      "buildx",
      "imagetools",
      "create",
      "--tag",
      publishedRef,
      "--prefer-index=false",
      `${request.registry}@${manifestDigest}`,
    ],
    { cwd: request.repoRoot, env }
  );

  if (created.status !== 0) {
    return fail(
      "publish-candidate",
      `Creating ${publishedRef} from ${request.registry}@${manifestDigest} failed with exit ${created.status}.`
    );
  }

  const inspected = runner(
    "docker",
    ["buildx", "imagetools", "inspect", "--raw", publishedRef],
    { cwd: request.repoRoot, env }
  );

  if (inspected.status !== 0) {
    return fail(
      "publish-candidate",
      `Inspecting the published ${publishedRef} failed with exit ${inspected.status}.`
    );
  }

  const publishedConfigDigest = parseConfigDigest(inspected.stdout);

  if (publishedConfigDigest === undefined) {
    return fail(
      "publish-candidate",
      `The published ${publishedRef} reported no config digest, so its smoke-tested identity cannot be confirmed. This fails closed.`
    );
  }

  if (publishedConfigDigest !== identity) {
    return fail(
      "publish-candidate",
      `The published ${publishedRef} carries config digest ${publishedConfigDigest}, not the smoke-tested identity ${identity}. The promotion did not preserve the verified bytes.`
    );
  }

  return { ok: true, identity, publishedRef };
}
