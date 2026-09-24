import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  runRelease,
  type CommandRunner,
  type ReleaseOutcome,
  type ReleaseRequest,
} from "./pipeline.ts";

/**
 * The real command boundary: spawn the child with the inherited environment
 * merged under the pipeline's own variables, so `PATH` survives and
 * `MODULE_INCLUDE` is set for the Nx gates and the image build.
 */
const spawnRunner: CommandRunner = (command, args, options) => {
  const result = spawnSync(command, [...args], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
};

const USAGE = `Usage: scripts/build-customer-image.sh <slug> <version> [options]

Reads customers/<slug>/deploy/modules.txt, builds the one production image with
that explicit include list, smoke-checks the built candidate, and publishes that
exact candidate identity. MODULE_INCLUDE is the only build argument.

Options:
  --registry <ref>         Registry repository to publish to.
                           Default: $GENIE_IMAGE_REGISTRY or ghcr.io/$GITHUB_REPOSITORY
  --publish                Publish after the smoke passes. This is the default;
                           the flag states the intent explicitly.
  --no-publish             Gates, build and smoke, but do not publish.
  --dry-run                Alias of --no-publish.
  --identity-out <path>    On success, write the resolved immutable identity to
                           this path, so a later --publish-digest run can
                           publish exactly the candidate this run smoked.
  --publish-digest <sha>   Publish a digest a prior run already gated, built and
                           smoked. Skips the gates, the build and the smoke.
  --publish-command <argv> A local/test sink that replaces the docker push. It
                           receives the immutable identity and the published ref.
  --smoke-command <argv>   Replaces the smoke invocation (test stub only).
  --development-fallback   R-55: build and publish the default every-module
                           image instead of a customer's. Takes only a version
                           and tags the ref development, never a customer.
  --repo-root <path>       The checkout to build from. Default: the repository root.
  --help                   Print this message.
`;

type Parsed = {
  readonly slug: string;
  readonly version: string;
  readonly registry: string;
  readonly publish: boolean;
  readonly publishCommand?: readonly string[] | undefined;
  readonly smokeCommand?: readonly string[] | undefined;
  readonly repoRoot: string;
  readonly developmentFallback: boolean;
  readonly identityOut?: string | undefined;
  readonly verifiedIdentity?: string | undefined;
};

const splitArgv = (value: string): readonly string[] =>
  value.split(/\s+/u).filter((token) => token !== "");

function usageError(message: string): never {
  process.stderr.write(`${message}\n\n${USAGE}`);
  process.exit(2);
}

export function parseArgv(
  argv: readonly string[],
  environment: Record<string, string | undefined>
): Parsed {
  const positional: string[] = [];
  let registry: string | undefined;
  let publish = true;
  let publishCommand: readonly string[] | undefined;
  let smokeCommand: readonly string[] | undefined;
  let repoRoot = resolve(import.meta.dirname, "../../../..");
  let developmentFallback = false;
  let identityOut: string | undefined;
  let verifiedIdentity: string | undefined;
  let sawNoPublish = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";

    switch (token) {
      case "--help":
        process.stdout.write(USAGE);
        process.exit(0);
        break;
      case "--registry":
        registry = argv[++index] ?? usageError("--registry needs a value.");
        break;
      case "--repo-root":
        repoRoot = resolve(
          argv[++index] ?? usageError("--repo-root needs a value.")
        );
        break;
      case "--publish-command":
        publishCommand = splitArgv(
          argv[++index] ?? usageError("--publish-command needs a value.")
        );
        break;
      case "--smoke-command":
        smokeCommand = splitArgv(
          argv[++index] ?? usageError("--smoke-command needs a value.")
        );
        break;
      case "--identity-out":
        identityOut =
          argv[++index] ?? usageError("--identity-out needs a value.");
        break;
      case "--publish-digest":
        // Publishing a verified digest is a publish by definition; the two
        // cannot be combined with --no-publish.
        verifiedIdentity =
          argv[++index] ?? usageError("--publish-digest needs a value.");
        publish = true;
        break;
      case "--development-fallback":
        developmentFallback = true;
        break;
      case "--publish":
        // Publishing is the default; the flag is accepted so the release
        // workflow can state its intent explicitly rather than rely on it.
        publish = true;
        break;
      case "--no-publish":
      case "--dry-run":
        publish = false;
        sawNoPublish = true;
        break;
      default:
        if (token.startsWith("--")) usageError(`Unknown option: ${token}`);
        positional.push(token);
    }
  }

  if (verifiedIdentity !== undefined && sawNoPublish) {
    usageError("--publish-digest cannot be combined with --no-publish.");
  }

  const [first, second, ...rest] = positional;

  if (rest.length > 0) {
    usageError("Too many positional arguments.");
  }

  // R-55: the development fallback takes only a version; a customer release
  // takes a slug and a version.
  const slug = developmentFallback ? "development" : first;
  const version = developmentFallback ? first : second;

  if (slug === undefined || version === undefined) {
    usageError(
      developmentFallback
        ? "The development fallback needs exactly a version."
        : "Exactly a customer slug and a version are required."
    );
  }

  const resolvedRegistry =
    registry ??
    environment.GENIE_IMAGE_REGISTRY ??
    (environment.GITHUB_REPOSITORY === undefined
      ? "ghcr.io/genie-ops-center/genie-ops-center"
      : `ghcr.io/${environment.GITHUB_REPOSITORY}`);

  return {
    slug,
    version,
    registry: resolvedRegistry,
    publish,
    publishCommand,
    smokeCommand,
    repoRoot,
    developmentFallback,
    identityOut,
    verifiedIdentity,
  };
}

export async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseArgv(argv, process.env);

  const request: ReleaseRequest = {
    slug: parsed.slug,
    version: parsed.version,
    repoRoot: parsed.repoRoot,
    registry: parsed.registry,
    publish: parsed.publish,
    publishCommand: parsed.publishCommand,
    smokeCommand: parsed.smokeCommand,
    developmentFallback: parsed.developmentFallback,
    verifiedIdentity: parsed.verifiedIdentity,
  };

  const outcome = await runRelease(request, spawnRunner).catch(
    (): ReleaseOutcome => ({
      ok: false,
      failedStep: "run-release",
      reason:
        "The release run threw before it could report a failure. Nothing is published.",
    })
  );

  if (!outcome.ok) {
    // The gate's own output, bounded and redacted, comes first so the status
    // line that names the failed step reads as its conclusion. A success
    // carries no output, so a passing release stays quiet.
    if (outcome.gateOutput !== undefined && outcome.gateOutput !== "") {
      process.stderr.write(`${outcome.gateOutput}\n`);
    }

    process.stderr.write(
      `release failed at ${outcome.failedStep ?? "unknown"}: ${outcome.reason ?? ""}\n`
    );

    return 1;
  }

  // Hand the resolved identity to a later step so a separate --publish-digest
  // run publishes exactly the candidate this run smoked
  // (genie-ops-center-v2-sl1).
  if (parsed.identityOut !== undefined && outcome.identity !== undefined) {
    writeFileSync(parsed.identityOut, `${outcome.identity}\n`, "utf8");
  }

  process.stdout.write(
    `candidate ${outcome.identity ?? ""} passed smoke; ${
      outcome.publishedRef === undefined
        ? "no publish was requested"
        : `published ${outcome.publishedRef}`
    }\n`
  );

  return 0;
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(import.meta.filename)
) {
  // Set the exit code rather than calling `process.exit`: on a pipe, stdout and
  // stderr are asynchronous, and `process.exit` discards whatever has not
  // flushed yet. A failed gate's tail is large, so exiting here would cut off
  // both the tail and the status line that follows it.
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch(() => {
      // `main` maps a thrown pipeline run to a failed outcome; this is the last
      // line of defence for an unexpected throw, and it fails the run closed.
      process.exitCode = 1;
    });
}
