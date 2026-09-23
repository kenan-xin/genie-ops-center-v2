/**
 * The image content checks R-32, R-33, R-41a, R-53 and AC-17/AC-28 ask for,
 * expressed as pure functions over an inventory the caller gathered from a real
 * image.
 *
 * Splitting the policy from the gathering is deliberate: the needles, the
 * non-vacuous control and the excluded-module rules are ordinary logic and are
 * unit tested against controlled fixtures, while the real image matrix feeds
 * this the same way. A scanner that matched nothing could never pass, because
 * the control case proves the same needles find an included module.
 *
 * Honest limits, stated rather than hidden: this scans file paths and byte
 * content verbatim. It does not decode compressed assets or exotic encodings,
 * and it cannot see a secret that is assembled at run time from environment
 * values. Those are recorded as limits, not asserted away.
 */

/** One committed layer line from `docker history --no-trunc`. */
export type ImageHistoryEntry = {
  readonly createdBy: string;
  readonly comment?: string;
};

/** One file gathered from the image filesystem. */
export type ImageFile = {
  readonly path: string;
  readonly content: string;
};

export type ImageScanFinding = {
  readonly kind:
    | "build-argument"
    | "secret"
    | "excluded-module"
    | "migration-file"
    | "dev-tooling";
  readonly path: string;
  readonly detail: string;
};

/** The only build argument the one Dockerfile may declare (R-32, DEC-33). */
export const ALLOWED_BUILD_ARGUMENT = "MODULE_INCLUDE";

/**
 * BuildKit injects its own provenance arguments into history. They are not
 * declared by the Dockerfile, so they are not build arguments this contract
 * governs; treating them as findings would make the check unusable.
 */
const BUILDKIT_PREFIX = "BUILDKIT_";

const DECLARED_ARGUMENT = /^ARG ([A-Za-z_][A-Za-z0-9_]*)$/;

/**
 * The high-signal secret markers worth scanning file *content* for.
 *
 * Generic `password: value`-shaped rules were tried and removed: bundled
 * third-party code is full of `password: this.password` and `apiKey` handling,
 * so they fail a real image on its own dependencies. What remains is a private
 * key block and a long bearer token — neither of which occurs in ordinary
 * runtime code — and file *paths* for the secret-bearing file types below.
 */
export function secretNeedles(): readonly RegExp[] {
  return [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\bBearer\s+[A-Za-z0-9._-]{20,}/,
  ];
}

/** Basenames and extensions that carry a secret, judged by path alone. */
export function secretPathFinding(path: string): string | undefined {
  const basename = path.split("/").at(-1) ?? "";

  if (basename === ".npmrc" || basename === ".netrc" || basename === "id_rsa") {
    return basename;
  }

  if (/^\.env(\.|$)/.test(basename)) return basename;

  const extension = /\.([A-Za-z0-9]+)$/.exec(basename)?.[1]?.toLowerCase();

  if (
    extension !== undefined &&
    ["pem", "key", "p12", "pfx"].includes(extension)
  ) {
    return basename;
  }

  return undefined;
}

/**
 * The development-only packages and artifacts that must not enter a customer
 * runtime image (R-41a, R-42, R-41e, R-5a, AC-12, AC-28).
 *
 * These are *path* needles, not content needles: a package that is merely named
 * in another package's manifest (Next's `devDependencies`, pg's `scripts`) is
 * not an installed dependency, while a path under that package's directory is.
 * The content rules already live in the devtools-exclusion suite, which scans
 * the built output for executable devtools code.
 */
export function devToolingNeedles(): readonly string[] {
  return [
    "/node_modules/@tanstack/react-devtools/",
    "/node_modules/@tanstack/react-query-devtools/",
    "/node_modules/@tanstack/react-form-devtools/",
    "/node_modules/@tanstack/react-pacer-devtools/",
    "/node_modules/@storybook/",
    "/node_modules/storybook/",
    "/node_modules/@playwright/",
    "/node_modules/vitest/",
    "/node_modules/testcontainers/",
    "/node_modules/oxlint/",
    "/node_modules/oxfmt/",
    "/node_modules/lefthook/",
    "/node_modules/@nx/",
    "/node_modules/@genie/generators/",
    "storybook-static",
    ".stories.",
  ];
}

/**
 * An excluded module's installed package and source folder, judged by path.
 *
 * The bare package name is not a needle: the app's own `package.json` declares
 * every workspace module as a dependency, so it names an excluded module in
 * every build. An installed directory is the leak, not the declaration.
 */
export function excludedModulePathNeedles(id: string): readonly string[] {
  return [`/node_modules/@genie/module-${id}/`, `packages/modules/${id}/`];
}

/**
 * An excluded module's high-signal content markers: its migration ledger, and
 * its workspace and admin route strings. These appear in a built bundle only
 * when the module's code or schema was compiled in.
 */
export function excludedModuleContentNeedles(id: string): readonly string[] {
  return [`__drizzle_migrations_${id}`, `"/m/${id}"`, `"/admin/m/${id}"`];
}

/**
 * One excluded module's needles as a single string, for callers that carry the
 * policy label rather than the individual matches.
 */
export function EXCLUDED_MODULE_PATH_NEEDLE(id: string): string {
  return [
    ...excludedModulePathNeedles(id),
    ...excludedModuleContentNeedles(id),
  ].join(" ");
}

const matchesSecret = (text: string) =>
  secretNeedles().some((needle) => needle.test(text));

const DECLARED_DOCKERFILE_ARGUMENT = /^\s*ARG\s+([A-Za-z_][A-Za-z0-9_]*)/;

/**
 * The `ARG` names a Dockerfile declares, in file order. This is the authority
 * R-32 speaks about: the arguments our file declares. `docker history` also
 * carries the base image's own arguments and BuildKit metadata, which are not
 * ours, so the two sets are compared rather than one inferred from the image.
 */
export function declaredBuildArguments(dockerfile: string): readonly string[] {
  const names: string[] = [];

  for (const line of dockerfile.split("\n")) {
    const declared = DECLARED_DOCKERFILE_ARGUMENT.exec(line);

    if (declared !== null && declared[1] !== undefined) names.push(declared[1]);
  }

  return names;
}

export type HistoryScanOptions = {
  /**
   * `ARG` names inherited from the base image's own history. R-32 governs the
   * arguments *this* Dockerfile declares, so an inherited `ARG NODE_VERSION`
   * from `node:26-alpine` is not a second build argument of ours.
   */
  readonly ignoreArgs?: readonly string[];
};

/**
 * A declared `ARG` other than `MODULE_INCLUDE`, or a secret committed onto a
 * history line, with the BuildKit metadata arguments and any inherited base
 * arguments excluded.
 */
export function scanHistory(
  history: readonly ImageHistoryEntry[],
  options: HistoryScanOptions = {}
): readonly ImageScanFinding[] {
  const findings: ImageScanFinding[] = [];
  const ignored = new Set(options.ignoreArgs ?? []);

  for (const entry of history) {
    const line = entry.createdBy.trim();
    const declared = DECLARED_ARGUMENT.exec(line);

    if (declared !== null) {
      const name = declared[1] ?? "";

      if (
        name !== ALLOWED_BUILD_ARGUMENT &&
        !name.startsWith(BUILDKIT_PREFIX) &&
        !ignored.has(name)
      ) {
        findings.push({
          kind: "build-argument",
          path: "history",
          detail: `The image declares the build argument ${name}; MODULE_INCLUDE must be the only one (R-32).`,
        });
      }
    }

    if (matchesSecret(line)) {
      findings.push({
        kind: "secret",
        path: "history",
        detail:
          "A history line carries a value that looks like a secret (R-33).",
      });
    }
  }

  return findings;
}

/** A usable non-empty string field of a gathered inventory line. */
function isNonEmptyString(value: unknown): value is string {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the boundary parse of inventory bytes
  return typeof value === "string" && value.trim() !== "";
}

/**
 * The largest file whose content the scanner reads. A file above it is reported
 * as an `oversized` record and the proof fails closed rather than scanning a
 * truncated body, so nothing silently escapes the content rules.
 *
 * The bound is calibrated above the largest file the current standalone runtime
 * emits (Next's `capsize-font-metrics.json`, about 4.1 MiB). A legitimate file
 * larger than this is a review item, not a silent skip.
 */
export const MAX_SCANNED_FILE_BYTES = 32 * 1024 * 1024;

/**
 * Parses the in-container filesystem inventory into `{ path, content }` pairs.
 *
 * The container emits one JSON object per regular file: `{ path, b64 }` inside
 * the size cap, or `{ path, oversized }` above it. An oversized record throws
 * with the path named — a bounded scan that skipped the file would be a false
 * negative, which is exactly what this collection exists to prevent. Duplicate
 * paths (a pnpm symlink and its target) are read once.
 */
export function filesystemEntries(stdout: string): readonly ImageFile[] {
  const seen = new Set<string>();
  const files: ImageFile[] = [];

  for (const line of stdout.split("\n").filter((entry) => entry !== "")) {
    // SAFETY: each line is one JSON object the container's own walk emitted; the
    // fields are re-validated below before use.
    const parsed = JSON.parse(line) as {
      path?: unknown;
      b64?: unknown;
      oversized?: unknown;
    };

    if (!isNonEmptyString(parsed.path)) {
      throw new Error(`malformed filesystem inventory line: ${line}`);
    }

    if (Number.isFinite(parsed.oversized) && Number(parsed.oversized) > 0) {
      throw new Error(
        `the image carries an unscanned file of ${String(parsed.oversized)} bytes at ${parsed.path}; it exceeds the scanner's ${MAX_SCANNED_FILE_BYTES}-byte cap, so the proof fails closed rather than skip it (F2, R-33).`
      );
    }

    // An empty file is legal and encodes to an empty string, so this checks the
    // field's type, not its length.
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the boundary parse of inventory bytes
    if (typeof parsed.b64 !== "string") {
      throw new Error(`malformed filesystem inventory line: ${line}`);
    }

    if (seen.has(parsed.path)) continue;

    seen.add(parsed.path);

    files.push({
      path: parsed.path,
      content: Buffer.from(parsed.b64, "base64").toString("utf8"),
    });
  }

  return files;
}

export type FileScanOptions = {
  readonly includedModules: readonly string[];
  readonly excludedModules: readonly string[];
};

const isPubliclyServed = (path: string) =>
  path.includes("public/") || path.includes(".next/static/");

/**
 * Scans the image filesystem for an excluded module's package, path or ledger,
 * publicly served migration SQL, development-only tooling and secrets. Returns
 * one finding per offending file and rule, so a failure names the artifact.
 */
export function scanFiles(
  files: readonly ImageFile[],
  options: FileScanOptions
): readonly ImageScanFinding[] {
  const findings: ImageScanFinding[] = [];

  const excluded = options.excludedModules.map((id) => ({
    id,
    paths: excludedModulePathNeedles(id),
    contents: excludedModuleContentNeedles(id),
  }));

  for (const file of files) {
    const excludedHits = excluded
      .filter(
        ({ paths, contents }) =>
          paths.some((needle) => file.path.includes(needle)) ||
          contents.some((needle) => file.content.includes(needle))
      )
      .map(({ id }) => id);

    for (const id of new Set(excludedHits)) {
      findings.push({
        kind: "excluded-module",
        path: file.path,
        detail: `The excluded module ${id} appears in the image (R-22).`,
      });
    }

    if (
      file.path.endsWith(".sql") &&
      (excludedHits.length > 0 || isPubliclyServed(file.path))
    ) {
      findings.push({
        kind: "migration-file",
        path: file.path,
        detail:
          "A migration SQL file is present for an excluded module or is publicly served (R-22, F2).",
      });
    }

    // Path, not content: an installed dev-only package is a directory under
    // node_modules, while a manifest that merely names one is not.
    const tooling = devToolingNeedles().find((needle) =>
      file.path.includes(needle)
    );

    if (tooling !== undefined) {
      findings.push({
        kind: "dev-tooling",
        path: file.path,
        detail: `The development-only package or artifact ${tooling} is installed in the image (R-41a, R-42, AC-28).`,
      });
    }

    const secretPath = secretPathFinding(file.path);

    if (secretPath !== undefined) {
      findings.push({
        kind: "secret",
        path: file.path,
        detail: `The secret-bearing file ${secretPath} is present in the image (R-33).`,
      });
    } else if (matchesSecret(file.content)) {
      findings.push({
        kind: "secret",
        path: file.path,
        detail:
          "The file content carries a private key or bearer token (R-33).",
      });
    }
  }

  return findings;
}
