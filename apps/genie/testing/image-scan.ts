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
 * The environment variable families that may never be committed onto a layer.
 * Each requires a value after the separator, so an environment variable *name*
 * with no value is not mistaken for a leaked secret.
 */
export function secretNeedles(): readonly RegExp[] {
  return [
    /postgres(ql)?:\/\/[^\s:@/]+:[^\s@/]+@/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\bPASSWORD\s*[=:]\s*\S/i,
    /\bSECRET\s*[=:]\s*\S/i,
    /\bapi[_-]?key\s*[=:]\s*\S/i,
    /\bBearer\s+[A-Za-z0-9._-]{8,}/,
  ];
}

/**
 * The development-only package families and artifacts that must not enter a
 * customer runtime image (R-41a, R-42, R-41e, R-5a, AC-12, AC-28).
 */
export function devToolingNeedles(): readonly string[] {
  return [
    "@tanstack/react-devtools",
    "@tanstack/react-query-devtools",
    "@tanstack/react-form-devtools",
    "@tanstack/react-pacer-devtools",
    "@storybook/",
    "storybook-static",
    "@genie/generators",
    "@nx/",
    "@playwright/test",
    "testcontainers",
    "oxlint",
    "oxfmt",
    "lefthook",
    "vitest",
    ".stories.",
  ];
}

/** The needles unique to one excluded module: package, folder and ledger. */
export function excludedModuleNeedles(id: string): readonly string[] {
  return [
    `@genie/module-${id}`,
    `packages/modules/${id}/`,
    `__drizzle_migrations_${id}`,
    `"/m/${id}"`,
    `"/admin/m/${id}"`,
  ];
}

/**
 * One excluded module's needles as a single string, for callers that carry the
 * policy label rather than the individual matches.
 */
export function EXCLUDED_MODULE_PATH_NEEDLE(id: string): string {
  return excludedModuleNeedles(id).join(" ");
}

const matchesSecret = (text: string) =>
  secretNeedles().some((needle) => needle.test(text));

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

  const excluded = options.excludedModules.flatMap((id) =>
    excludedModuleNeedles(id).map((needle) => ({ id, needle }))
  );

  for (const file of files) {
    const text = `${file.path}\n${file.content}`;

    const excludedHits = excluded
      .filter(({ needle }) => text.includes(needle))
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

    const tooling = devToolingNeedles().find(
      (needle) => file.content.includes(needle) || file.path.includes(needle)
    );

    if (tooling !== undefined) {
      findings.push({
        kind: "dev-tooling",
        path: file.path,
        detail: `The development-only marker ${tooling} is present in the image (R-41a, R-42, AC-28).`,
      });
    }

    if (matchesSecret(text)) {
      findings.push({
        kind: "secret",
        path: file.path,
        detail: "The file carries a value that looks like a secret (R-33).",
      });
    }
  }

  return findings;
}
