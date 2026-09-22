import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The Storybook selection, confidentiality and local-cache matrix.
 *
 * Every case drives a real `build-storybook` or `test-storybook` run and reads
 * the artifact it produced. A cache summary line alone proves nothing here: the
 * question is whether the static output belongs to the selection that was
 * asked for, and whether an excluded module left any trace of itself in it.
 *
 * The whole matrix runs inside a staged workspace, never the checkout. A real
 * `build-storybook` writes `apps/storybook/storybook-static`, so a case that
 * ran in the checkout would depend on no sibling task running at the same time.
 * The stage is a copy with the root `node_modules` symlinked back; its
 * `apps/storybook/node_modules` is copied as it stands, because its entries are
 * relative symlinks that then resolve to the stage's own packages.
 *
 * A second module is written into the stage so that two explicit selections
 * produce genuinely different output. The real generator path is proved
 * separately by `tools/generators/scripts/prove-generated-module.ts`; here the
 * fixture only has to satisfy the data-only inventory contract.
 */
const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");

/** Build output, version control, caches and bulk documents: none is an input here. */
const PRUNED = new Set([
  ".git",
  ".next",
  ".nx",
  ".beads",
  ".dolt",
  ".impeccable",
  ".turbo",
  ".agents",
  ".claude",
  ".codex",
  ".config",
  "graft",
  "storybook-static",
  "test-results",
  "playwright-report",
  "coverage",
  "dist",
  "docs",
  "plans",
]);

const BUILD_TASK = "@genie/storybook:build-storybook";

const TEST_TASK = "@genie/storybook:test-storybook";

const STATIC_DIR = "apps/storybook/storybook-static";

/** A module id, folder and package that already agree, so the inventory accepts them. */
const SECOND_ID = "second-fixture";

const SECOND_NEEDLE = "The second fixture module renders in the workbench.";

const SECOND_TITLE = "Modules/Second fixture/Probe";

/**
 * Probes unique to the placeholder module that survive the static build: its
 * story title, the fixture text its story renders, and its package name. Each
 * was confirmed present in a placeholder build and absent from an empty one
 * before it was trusted here.
 */
const PLACEHOLDER_NEEDLES = [
  "Modules/Placeholder",
  "A fixture row. It proves layout, not persistence.",
  "@genie/module-placeholder",
];

const SECOND_NEEDLES = [SECOND_TITLE, SECOND_NEEDLE];

const SECOND_MANIFEST = `${JSON.stringify(
  {
    name: "@genie/module-second-fixture",
    version: "0.0.0",
    private: true,
    type: "module",
    exports: { ".": "./src/index.ts" },
    genie: { module: { id: SECOND_ID, entrypoint: "src/index.ts" } },
  },
  undefined,
  2
)}\n`;

const SECOND_ENTRYPOINT = "export {};\n";

const SECOND_STORY = `import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

function SecondFixtureProbe() {
  return <p>${SECOND_NEEDLE}</p>;
}

const meta = {
  title: "${SECOND_TITLE}",
  component: SecondFixtureProbe,
  tags: ["autodocs"],
} satisfies Meta<typeof SecondFixtureProbe>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("${SECOND_NEEDLE}")).toBeInTheDocument();
  },
};
`;

let stage = "";

type Run = {
  readonly status: number;
  readonly output: string;
};

/** Built from the escape character rather than written literally, which no linter has to be told to allow. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

const stripAnsi = (text: string) => text.replace(ANSI, "");

const staticPath = () => join(stage, STATIC_DIR);

const indexPath = () => join(staticPath(), "index.json");

const secondRoot = () => join(stage, "packages/modules", SECOND_ID);

/**
 * Runs one Nx task for one selection, inside the stage. `undefined` means the
 * variable is unset, which is a different selection from an empty string and
 * must stay that way all the way to the hash.
 *
 * Every inherited `NX_` variable is dropped before the three this suite sets,
 * so the measurement is of the build graph rather than of how it was invoked.
 */
function run(task: string, moduleInclude: string | undefined): Run {
  const env = { ...process.env };

  for (const name of Object.keys(env)) {
    if (name.startsWith("NX_")) delete env[name];
  }

  env.NX_CACHE_DIRECTORY = join(stage, ".nxcache");
  env.NX_WORKSPACE_DATA_DIRECTORY = join(stage, ".nxdata");
  env.NX_DAEMON = "false";

  if (moduleInclude === undefined) delete env.MODULE_INCLUDE;
  else env.MODULE_INCLUDE = moduleInclude;

  const result = spawnSync(join(stage, "node_modules/.bin/nx"), ["run", task], {
    cwd: stage,
    encoding: "utf8",
    env,
  });

  return {
    status: result.status ?? -1,
    output: stripAnsi(`${result.stdout}${result.stderr}`),
  };
}

function ran(task: string, moduleInclude: string | undefined): Run {
  const result = run(task, moduleInclude);

  if (result.status !== 0) {
    throw new Error(
      `${task} failed for ${String(moduleInclude)}:\n${result.output}`
    );
  }

  return result;
}

/** Whether Nx served the task from the cache instead of running its command. */
function servedFromCache(output: string, task: string): boolean {
  const line = output
    .split("\n")
    .find((candidate) => candidate.includes(`nx run ${task}`));

  return (
    line !== undefined &&
    (line.includes("[local cache]") ||
      line.includes("existing outputs match the cache"))
  );
}

type StoryIndex = {
  readonly entries: Record<
    string,
    { readonly title: string; readonly type: string }
  >;
};

function index(): StoryIndex {
  // SAFETY: the bytes are the artifact this test's own build just wrote, and
  // only an entry's key or title is ever read from the parsed value.
  return JSON.parse(readFileSync(indexPath(), "utf8")) as StoryIndex;
}

/** Every file the static build wrote, at any depth. */
function outputFiles(): readonly string[] {
  if (!existsSync(staticPath())) return [];

  return readdirSync(staticPath(), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

/** Which output files carry each needle, as paths relative to the static root. */
function hits(needles: readonly string[]): Record<string, readonly string[]> {
  const files = outputFiles().map(
    (path) => [path, readFileSync(path, "utf8")] as const
  );

  return Object.fromEntries(
    needles.map((needle) => [
      needle,
      files
        .filter(([, text]) => text.includes(needle))
        .map(([path]) => relative(staticPath(), path)),
    ])
  );
}

/** The module story ids an index holds, which is where exclusion is read. */
const moduleEntries = (built: StoryIndex) =>
  Object.keys(built.entries).filter((id) => id.startsWith("modules-"));

function writeSecondFixture(): void {
  mkdirSync(join(secondRoot(), "src"), { recursive: true });
  writeFileSync(join(secondRoot(), "package.json"), SECOND_MANIFEST);
  writeFileSync(join(secondRoot(), "src/index.ts"), SECOND_ENTRYPOINT);
  writeFileSync(join(secondRoot(), "src/probe.stories.tsx"), SECOND_STORY);
}

function removeSecondFixture(): void {
  rmSync(secondRoot(), { recursive: true, force: true });
}

beforeAll(() => {
  stage = mkdtempSync(join(tmpdir(), "genie-storybook-matrix-"));

  cpSync(WORKSPACE_ROOT, stage, {
    recursive: true,
    filter: (source) => {
      // The root node_modules is replaced by a symlink below. A nested one,
      // such as the host's, is copied: its entries are relative symlinks into
      // the workspace, so inside the stage they point at the stage's packages.
      if (source === join(WORKSPACE_ROOT, "node_modules")) return false;

      if (source === join(WORKSPACE_ROOT, "apps/storybook/storybook-static")) {
        return false;
      }

      const name = source.split(/[\\/]/).pop() ?? "";

      return !PRUNED.has(name);
    },
  });

  // A real install links the stage's own packages. Symlinking the checkout's
  // root `node_modules` into the stage is not enough: the Vitest browser server
  // resolves the addon's setup file to its real path, the browser then fetches
  // a path outside the served root, and every component test fails to import.
  // The install is cheap because the store is warm, and `--frozen-lockfile`
  // keeps the copied lockfile untouched.
  const install = spawnSync(
    "pnpm",
    ["install", "--frozen-lockfile", "--ignore-scripts", "--silent"],
    { cwd: stage, encoding: "utf8" }
  );

  if (install.status !== 0) {
    throw new Error(
      `pnpm install failed in the stage:\n${install.stdout}${install.stderr}`
    );
  }

  writeSecondFixture();
}, 300000);

afterAll(() => {
  if (stage !== "") rmSync(stage, { recursive: true, force: true });
});

describe("two explicit selections on one revision", () => {
  it("gives each selection its own static output, and never the other's", () => {
    const second = ran(BUILD_TASK, SECOND_ID);

    expect(servedFromCache(second.output, BUILD_TASK)).toBe(false);

    const secondIndex = index();

    expect(
      secondIndex.entries["modules-second-fixture-probe--default"]
    ).toBeDefined();

    const secondHits = hits([...PLACEHOLDER_NEEDLES, ...SECOND_NEEDLES]);

    for (const needle of SECOND_NEEDLES) {
      expect(secondHits[needle]?.length, `missing ${needle}`).toBeGreaterThan(
        0
      );
    }

    for (const needle of PLACEHOLDER_NEEDLES) {
      expect(secondHits[needle], `placeholder leaked into ${needle}`).toEqual(
        []
      );
    }

    const placeholder = ran(BUILD_TASK, "placeholder");

    expect(servedFromCache(placeholder.output, BUILD_TASK)).toBe(false);

    const placeholderIndex = index();

    expect(
      placeholderIndex.entries["modules-placeholder-workspace-page--desktop"]
    ).toBeDefined();

    const placeholderHits = hits([...PLACEHOLDER_NEEDLES, ...SECOND_NEEDLES]);

    for (const needle of PLACEHOLDER_NEEDLES) {
      expect(
        placeholderHits[needle]?.length,
        `missing ${needle}`
      ).toBeGreaterThan(0);
    }

    for (const needle of SECOND_NEEDLES) {
      expect(
        placeholderHits[needle],
        `second module leaked into ${needle}`
      ).toEqual([]);
    }

    // Back to the first selection: a hit, and the bytes are the first run's.
    const again = ran(BUILD_TASK, SECOND_ID);

    expect(servedFromCache(again.output, BUILD_TASK), again.output).toBe(true);
    expect(index()).toEqual(secondIndex);
  });

  it("serializes an explicitly empty selection as UI and Core only", () => {
    const empty = ran(BUILD_TASK, "");

    expect(servedFromCache(empty.output, BUILD_TASK)).toBe(false);
    expect(moduleEntries(index())).toEqual([]);

    const emptyHits = hits([...PLACEHOLDER_NEEDLES, ...SECOND_NEEDLES]);

    for (const needle of [...PLACEHOLDER_NEEDLES, ...SECOND_NEEDLES]) {
      expect(
        emptyHits[needle],
        `${needle} leaked into the scoped build`
      ).toEqual([]);
    }
  });

  it("repeats an identical selection from the cache, byte for byte", () => {
    const first = ran(BUILD_TASK, SECOND_ID);
    const firstIndex = index();

    const second = ran(BUILD_TASK, SECOND_ID);

    expect(servedFromCache(second.output, BUILD_TASK), second.output).toBe(
      true
    );
    expect(first.status).toBe(0);
    expect(index()).toEqual(firstIndex);
  });
});

describe("all available, which is the unset default", () => {
  it("reaches every module and is distinct from an explicitly empty selection", () => {
    const empty = ran(BUILD_TASK, "");

    // Rebuilding the empty selection first makes the next run a cache miss only
    // if unset is a different selection from empty at the hash.
    void empty;

    const all = ran(BUILD_TASK, undefined);

    expect(servedFromCache(all.output, BUILD_TASK)).toBe(false);

    const allIndex = index();

    expect(
      allIndex.entries["modules-placeholder-workspace-page--desktop"]
    ).toBeDefined();
    expect(
      allIndex.entries["modules-second-fixture-probe--default"]
    ).toBeDefined();
  });

  it("reuses an identical unset selection", () => {
    const first = ran(BUILD_TASK, undefined);
    const firstIndex = index();

    const second = ran(BUILD_TASK, undefined);

    expect(servedFromCache(second.output, BUILD_TASK), second.output).toBe(
      true
    );
    expect(first.status).toBe(0);
    expect(index()).toEqual(firstIndex);
  });
});

describe("an unknown module id", () => {
  it("fails the build instead of widening the selection", () => {
    const result = run(BUILD_TASK, "does-not-exist");

    expect(result.status).not.toBe(0);
    expect(result.output).toContain("Unknown module id");
  });

  it("fails the component-test run as well", () => {
    const result = run(TEST_TASK, "does-not-exist");

    expect(result.status).not.toBe(0);
    expect(result.output).toContain("Unknown module id");
  });
});

describe("a deleted static output", () => {
  it("is restored from the cache before any consumer reads it", () => {
    const first = ran(BUILD_TASK, SECOND_ID);
    const firstIndex = index();

    rmSync(staticPath(), { recursive: true, force: true });

    expect(existsSync(indexPath())).toBe(false);

    const restored = ran(BUILD_TASK, SECOND_ID);

    // Not "outputs already match": the directory was gone, so a hit here means
    // Nx wrote it back out of the cache.
    expect(restored.output).toContain("[local cache]");
    expect(first.status).toBe(0);
    expect(index()).toEqual(firstIndex);
  });
});

describe("an inventory change", () => {
  it("invalidates the cache and drops the removed module from discovery", () => {
    const before = ran(BUILD_TASK, undefined);

    expect(before.status).toBe(0);

    const beforeModules = moduleEntries(index());

    expect(beforeModules.some((id) => id.startsWith("modules-second-"))).toBe(
      true
    );
    expect(
      beforeModules.some((id) => id.startsWith("modules-placeholder-"))
    ).toBe(true);

    removeSecondFixture();

    const after = ran(BUILD_TASK, undefined);

    // The resolved selection metadata changed, so the previous entry must not
    // be reused even though the MODULE_INCLUDE value did not change.
    expect(servedFromCache(after.output, BUILD_TASK), after.output).toBe(false);

    const afterModules = moduleEntries(index());

    expect(afterModules.some((id) => id.startsWith("modules-second-"))).toBe(
      false
    );
    expect(
      afterModules.some((id) => id.startsWith("modules-placeholder-"))
    ).toBe(true);

    writeSecondFixture();
  });

  it("discovers a newly added module with no host or CI edit", () => {
    const without = ran(BUILD_TASK, "placeholder");

    expect(without.status).toBe(0);
    expect(
      Object.keys(index().entries).some((id) =>
        id.startsWith("modules-second-")
      )
    ).toBe(false);

    // The fixture is already on disk; selecting it is the only change. No host
    // file and no CI configuration names it.
    const withSecond = ran(BUILD_TASK, SECOND_ID);

    expect(withSecond.status).toBe(0);
    expect(
      index().entries["modules-second-fixture-probe--default"]?.title
    ).toBe(SECOND_TITLE);
  });
});

describe("the static artifact and source maps", () => {
  it("reads a real build, so an empty scan cannot pass", () => {
    ran(BUILD_TASK, SECOND_ID);

    const files = outputFiles();

    expect(files.length).toBeGreaterThan(10);
    expect(files.some((path) => path.endsWith("index.json"))).toBe(true);
    expect(files.some((path) => path.endsWith(".js"))).toBe(true);
  });

  // The control for the search itself: the same method finds the included
  // module, so a scan that matched nothing anywhere would fail here.
  it("finds the included module by the same search", () => {
    const placeholder = ran(BUILD_TASK, "placeholder");

    expect(placeholder.status).toBe(0);

    const found = hits(PLACEHOLDER_NEEDLES);

    expect(found["Modules/Placeholder"]?.length).toBeGreaterThan(0);
  });

  it("publishes no source map that could carry excluded source", () => {
    ran(BUILD_TASK, "");

    const maps = outputFiles()
      .map((path) => relative(staticPath(), path))
      .filter((path) => path.endsWith(".map"));

    expect(maps).toEqual([]);
  });
});

/**
 * The development server's story index. It is the same selection-resolved
 * index the `@storybook/addon-mcp` toolset reads, so proving what this endpoint
 * serves is what proves the addon cannot expose an excluded module's content.
 *
 * The `/mcp` endpoint itself is a streaming HTTP endpoint and is not driven
 * here; the content boundary is upstream of it, in `.storybook/main.ts`, which
 * resolves the selection before any story is collected.
 */
async function devServerEntries(
  moduleInclude: string,
  port: number
): Promise<readonly string[]> {
  const child = spawn(
    join(stage, "node_modules/.bin/storybook"),
    [
      "dev",
      "--port",
      String(port),
      "--host",
      "127.0.0.1",
      "--no-open",
      "--ci",
      "--quiet",
    ],
    {
      cwd: join(stage, "apps/storybook"),
      env: {
        ...process.env,
        MODULE_INCLUDE: moduleInclude,
        STORYBOOK_DISABLE_TELEMETRY: "1",
      },
      stdio: "ignore",
    }
  );

  try {
    const deadline = Date.now() + 90000;
    let lastError: unknown;

    /* eslint-disable no-await-in-loop -- a poll must finish one attempt before the next */
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/index.json`, {
          signal: AbortSignal.timeout(2000),
        });

        if (response.ok) {
          // SAFETY: the bytes are Storybook's own index.json, and only the
          // entry keys are read below.
          const body = (await response.json()) as {
            entries: Record<
              string,
              { readonly title: string; readonly type: string }
            >;
          };

          return Object.keys(body.entries);
        }
      } catch (error) {
        lastError = error;
      }

      await new Promise((wake) => setTimeout(wake, 500));
    }
    /* eslint-enable no-await-in-loop */

    throw new Error(
      `the Storybook development server did not answer on ${port}: ${String(lastError)}`
    );
  } finally {
    child.kill("SIGKILL");
  }
}

describe("the development server the MCP addon reads", () => {
  it("serves no excluded module's stories", async () => {
    const entries = await devServerEntries("", 6181);

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.filter((id) => id.startsWith("modules-"))).toEqual([]);
  });

  it("serves exactly the selected module's stories and no other module's", async () => {
    const entries = await devServerEntries(SECOND_ID, 6182);

    expect(entries.some((id) => id.startsWith("modules-second-fixture-"))).toBe(
      true
    );
    expect(entries.some((id) => id.startsWith("modules-placeholder-"))).toBe(
      false
    );
  });
});

describe("the component-test layer", () => {
  it("runs a nonempty collection rather than a quiet empty pass", () => {
    const result = ran(TEST_TASK, SECOND_ID);

    const passed = /Tests\s+(\d+) passed/.exec(result.output)?.[1];

    expect(passed, result.output).toBeDefined();
    expect(Number(passed)).toBeGreaterThan(0);
  });

  it("runs again when the selection changes, and reuses an identical one", () => {
    ran(TEST_TASK, SECOND_ID);

    const changed = ran(TEST_TASK, "placeholder");

    expect(servedFromCache(changed.output, TEST_TASK), changed.output).toBe(
      false
    );

    const repeat = ran(TEST_TASK, "placeholder");

    expect(servedFromCache(repeat.output, TEST_TASK), repeat.output).toBe(true);
  });

  it("propagates a failing interaction", () => {
    const broken = join(stage, "packages/ui/src/__matrix__/broken.stories.tsx");

    mkdirSync(join(stage, "packages/ui/src/__matrix__"), { recursive: true });

    writeFileSync(
      broken,
      `import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

const meta = {
  title: "UI/Matrix broken",
  component: () => <p>Matrix probe</p>,
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const InteractionFails: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("this text is not rendered")).toBeInTheDocument();
  },
};
`
    );

    try {
      const result = run(TEST_TASK, "");

      expect(result.status).not.toBe(0);
      // The failure is the interaction assertion itself, not an unrelated
      // setup error: the message is the one the story's `getByText` raised.
      expect(result.output).toContain(
        "Unable to find an element with the text"
      );
    } finally {
      rmSync(broken, { force: true });
    }
  });

  it("propagates an accessibility violation", () => {
    const broken = join(stage, "packages/ui/src/__matrix__/broken.stories.tsx");

    mkdirSync(join(stage, "packages/ui/src/__matrix__"), { recursive: true });

    writeFileSync(
      broken,
      `import type { Meta, StoryObj } from "@storybook/nextjs-vite";

const meta = {
  title: "UI/Matrix inaccessible",
  component: () => (
    <div>
      <img src="/does-not-exist.png" />
    </div>
  ),
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const A11yFails: Story = {};
`
    );

    try {
      const result = run(TEST_TASK, "");

      expect(result.status).not.toBe(0);
      // The axe rule that fired, so the failure is the accessibility gate and
      // not an unrelated error.
      expect(result.output).toContain("image-alt");
    } finally {
      rmSync(broken, { force: true });
    }
  });

  it("passes again once the failing stories are removed", () => {
    const result = ran(TEST_TASK, "");

    expect(result.status).toBe(0);
  });
});

/**
 * The owner inputs R-41b names: a story, a component, a shared token, a
 * provider, a message catalogue. Each file really exists, and each is changed
 * by appending a comment, which is enough to move the content hash without
 * altering what the build renders.
 *
 * The inventory case above covers a module being added and removed. These cases
 * cover the rest, so a dropped `storybookOwners` glob fails here.
 */
const MUTATIONS = [
  ["a story", "packages/ui/src/disclosure/disclosure.stories.tsx"],
  ["a component", "packages/ui/src/disclosure/disclosure.tsx"],
  ["a shared token", "packages/ui/src/theme/tokens.ts"],
  ["a provider", "packages/ui/src/theme/theme-provider.tsx"],
  ["a message catalogue", "packages/core/src/lib/errors/index.ts"],
] as const;

describe("an owner input mutation", () => {
  it.each(MUTATIONS)("invalidates the build when %s changes", (_label, rel) => {
    const path = join(stage, rel);
    const original = readFileSync(path, "utf8");

    // Warm the cache entry for this exact selection first.
    ran(BUILD_TASK, "placeholder");

    try {
      writeFileSync(path, `${original}\n// matrix mutation\n`);

      const changed = ran(BUILD_TASK, "placeholder");

      expect(servedFromCache(changed.output, BUILD_TASK), changed.output).toBe(
        false
      );
    } finally {
      writeFileSync(path, original);
    }
  });

  it("invalidates the component tests when a story changes", () => {
    const path = join(
      stage,
      "packages/ui/src/disclosure/disclosure.stories.tsx"
    );

    const original = readFileSync(path, "utf8");

    ran(TEST_TASK, "placeholder");

    try {
      writeFileSync(path, `${original}\n// matrix mutation\n`);

      const changed = ran(TEST_TASK, "placeholder");

      expect(servedFromCache(changed.output, TEST_TASK), changed.output).toBe(
        false
      );
    } finally {
      writeFileSync(path, original);
    }
  });
});
