import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const WORKSPACE_ROOT = join(import.meta.dirname, "../../..");

const GENERATORS_ROOT = join(WORKSPACE_ROOT, "tools/generators");

const GENERATORS_MANIFEST = join(GENERATORS_ROOT, "package.json");

const STORYBOOK_CONSUMER_ROOT = join(
  WORKSPACE_ROOT,
  "apps/storybook/.storybook"
);

type GeneratorsManifest = {
  readonly exports?: { readonly ".": string };
};

type FixtureManifest = {
  readonly name: string;
  readonly type: "module";
  readonly main?: string;
  readonly exports?: { readonly ".": string };
};

type FixtureFile = {
  readonly path: string;
  readonly contents: string;
};

type FixtureModule = {
  readonly resolvedVia: string;
};

const EXPORTS_FILE = "exports-entry.cjs";

const MAIN_FILE = "legacy-main.cjs";

const ABSENT_FILE = "absent-exports-entry.cjs";

const EXPORTS_MODULE = 'module.exports = { resolvedVia: "exports-map" };\n';

const MAIN_MODULE = 'module.exports = { resolvedVia: "legacy-main" };\n';

/**
 * A disposable package tree in the OS temp directory. The fixtures model the
 * one thing the real `tools/generators` manifest cannot: a package that carries
 * both a valid legacy `main` and an `exports` map, so a probe can tell which
 * field Node actually honours.
 */
const FIXTURE_ROOT = mkdtempSync(join(tmpdir(), "genie-generator-entrypoint-"));

function createFixturePackage(
  manifest: FixtureManifest,
  files: readonly FixtureFile[]
): string {
  const directory = join(FIXTURE_ROOT, "node_modules", manifest.name);

  mkdirSync(directory, { recursive: true });

  writeFileSync(
    join(directory, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  for (const file of files) {
    const target = join(directory, file.path);

    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.contents);
  }

  return directory;
}

/**
 * Node's CommonJS resolver is the one that runs the legacy `main` fallback the
 * original disposable probe reached. Anchoring `createRequire` inside the
 * fixture root keeps resolution to the fixture's own `node_modules`.
 */
function fixtureRequire(): NodeRequire {
  return createRequire(join(FIXTURE_ROOT, "sentinel.cjs"));
}

function resolveFixture(specifier: string): string {
  return fixtureRequire().resolve(specifier);
}

function loadFixture(specifier: string): FixtureModule {
  // SAFETY: every fixture entry module assigns `module.exports` to an object
  // carrying exactly this string field, written by this file a moment earlier.
  return fixtureRequire()(specifier) as FixtureModule;
}

function resolutionMessage(specifier: string): string {
  try {
    fixtureRequire().resolve(specifier);
  } catch (error) {
    // SAFETY: Node's resolver throws an Error; the fallback only guards a
    // non-Error throw so the assertion can still read a diagnostic.
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error(`Expected the fixture ${specifier} to fail resolution.`);
}

const exportsWins = createFixturePackage(
  {
    name: "@genie/fixture-exports-wins",
    type: "module",
    exports: { ".": `./${EXPORTS_FILE}` },
    main: `./${MAIN_FILE}`,
  },
  [
    { path: EXPORTS_FILE, contents: EXPORTS_MODULE },
    { path: MAIN_FILE, contents: MAIN_MODULE },
  ]
);

const exportsBrokenWithMain = createFixturePackage(
  {
    name: "@genie/fixture-exports-broken",
    type: "module",
    exports: { ".": `./${ABSENT_FILE}` },
    main: `./${MAIN_FILE}`,
  },
  [{ path: MAIN_FILE, contents: MAIN_MODULE }]
);

const legacyMainOnly = createFixturePackage(
  {
    name: "@genie/fixture-legacy-main-only",
    type: "module",
    main: `./${MAIN_FILE}`,
  },
  [{ path: MAIN_FILE, contents: MAIN_MODULE }]
);

const exportsBrokenWithoutMain = createFixturePackage(
  {
    name: "@genie/fixture-exports-only-broken",
    type: "module",
    exports: { ".": `./${ABSENT_FILE}` },
  },
  []
);

afterAll(() => {
  rmSync(FIXTURE_ROOT, { recursive: true, force: true });
});

describe("the @genie/generators entrypoint", () => {
  it("declares its selection barrel in the real exports map", () => {
    // SAFETY: this is the repository's own tracked manifest; the exact
    // mapping and the existence of its target are asserted right here.
    const manifest = JSON.parse(
      readFileSync(GENERATORS_MANIFEST, "utf8")
    ) as GeneratorsManifest;

    expect(manifest.exports?.["."]).toBe("./src/selection/index.ts");
    expect(existsSync(join(GENERATORS_ROOT, "src/selection/index.ts"))).toBe(
      true
    );
  });

  it("reaches the barrel by package specifier from the real consuming host", () => {
    const resolved = createRequire(
      join(STORYBOOK_CONSUMER_ROOT, "main.ts")
    ).resolve("@genie/generators");

    expect(resolved).toBe(join(GENERATORS_ROOT, "src/selection/index.ts"));
  });

  it("keeps its disposable fixture outside the repository", () => {
    expect(FIXTURE_ROOT.startsWith(`${WORKSPACE_ROOT}/`)).toBe(false);
    expect(existsSync(join(FIXTURE_ROOT, "node_modules"))).toBe(true);
  });

  it("resolves the exports target, not the valid legacy main, when both exist", () => {
    expect(resolveFixture("@genie/fixture-exports-wins")).toBe(
      join(exportsWins, EXPORTS_FILE)
    );

    expect(loadFixture("@genie/fixture-exports-wins").resolvedVia).toBe(
      "exports-map"
    );

    // The main file is a real, loadable alternative, so the assertion above
    // chooses between two working entrypoints rather than the only one.
    expect(existsSync(join(exportsWins, MAIN_FILE))).toBe(true);
  });

  it("fails even though a valid legacy main exists, because exports replaces the fallback", () => {
    expect(existsSync(join(exportsBrokenWithMain, MAIN_FILE))).toBe(true);

    const message = resolutionMessage("@genie/fixture-exports-broken");

    expect(message).toMatch(/cannot find module/i);
    expect(message).toContain(ABSENT_FILE);
    expect(message).not.toContain(MAIN_FILE);
  });

  it("resolves the same main file once the exports map is absent, proving that fallback works", () => {
    expect(resolveFixture("@genie/fixture-legacy-main-only")).toBe(
      join(legacyMainOnly, MAIN_FILE)
    );

    expect(loadFixture("@genie/fixture-legacy-main-only").resolvedVia).toBe(
      "legacy-main"
    );
  });

  it("reproduces the original control's undifferentiated failure when no main exists", () => {
    expect(existsSync(join(exportsBrokenWithoutMain, MAIN_FILE))).toBe(false);

    const message = resolutionMessage("@genie/fixture-exports-only-broken");

    // Same failure shape as the case that still had a valid main, which is why
    // the original probe could not tell "no entrypoint" from "exports decides".
    expect(message).toMatch(/cannot find module/i);
    expect(message).toContain(ABSENT_FILE);
    expect(message).not.toContain(MAIN_FILE);
  });
});
