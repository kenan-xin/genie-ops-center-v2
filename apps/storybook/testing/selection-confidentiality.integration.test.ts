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
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { retryImportRace, type Run } from "./nested-run.ts";

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

/** A module with no UI. It must be selectable and contribute no dummy story. */
const HEADLESS_ID = "headless-fixture";

const HEADLESS_MANIFEST = `${JSON.stringify(
  {
    name: "@genie/module-headless-fixture",
    version: "0.0.0",
    private: true,
    type: "module",
    exports: { ".": "./src/index.ts" },
    genie: { module: { id: HEADLESS_ID, entrypoint: "src/index.ts" } },
  },
  undefined,
  2
)}\n`;

const HEADLESS_ENTRYPOINT = "export {};\n";

let stage = "";

/**
 * The bound on one nested command. `spawnSync` blocks the worker's event loop,
 * so Vitest's own test timeout can never fire while it waits; without this a
 * stalled nested run holds the whole CI step open with no output. SIGTERM, the
 * default kill signal, lets Nx stop its own task processes on the way out.
 */
const NESTED_RUN_TIMEOUT_MS = 240000;

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
 *
 * A component-test run that hits the Vitest browser import race runs once more;
 * `nested-run.ts` says why and how narrowly.
 */
function run(task: string, moduleInclude: string | undefined): Run {
  return retryImportRace(() => runOnce(task, moduleInclude));
}

function runOnce(task: string, moduleInclude: string | undefined): Run {
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
    timeout: NESTED_RUN_TIMEOUT_MS,
  });

  return {
    status: result.status ?? -1,
    output: stripAnsi(
      `${result.stdout}${result.stderr}${result.error === undefined ? "" : `\n${String(result.error)}`}`
    ),
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

/** A module package with an entrypoint and no stories at all. */
function writeHeadlessFixture(): void {
  const root = join(stage, "packages/modules", HEADLESS_ID);

  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "package.json"), HEADLESS_MANIFEST);
  writeFileSync(join(root, "src/index.ts"), HEADLESS_ENTRYPOINT);
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
    { cwd: stage, encoding: "utf8", timeout: NESTED_RUN_TIMEOUT_MS }
  );

  if (install.status !== 0) {
    throw new Error(
      `pnpm install failed in the stage:\n${install.stdout}${install.stderr}`
    );
  }

  writeSecondFixture();
  writeHeadlessFixture();
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

describe("a headless module", () => {
  // ui-development.md: a headless module receives no dummy story. It still has
  // to be a valid selection that builds.
  it("is selectable and contributes no story of its own", () => {
    const result = ran(BUILD_TASK, HEADLESS_ID);

    expect(result.status).toBe(0);

    const built = index();

    expect(
      Object.keys(built.entries).some((id) =>
        id.startsWith(`modules-${HEADLESS_ID}-`)
      )
    ).toBe(false);

    // The host's own stories are still collected, so the run is nonempty, and
    // no other module was pulled in by selecting the headless one.
    expect(Object.keys(built.entries).length).toBeGreaterThan(0);
    expect(
      moduleEntries(built).some((id) => id.startsWith("modules-placeholder-"))
    ).toBe(false);
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

  // The static build emits no source map at all, and that absence is the
  // confidentiality property: a map carries the original text of every story,
  // component and fixture, including an excluded module's. A future build that
  // starts emitting maps fails here, so the change is examined rather than
  // shipped, and a map that does appear has to be scanned like any other file.
  it("publishes no source map that could carry excluded source", () => {
    ran(BUILD_TASK, "");

    const maps = outputFiles()
      .map((path) => relative(staticPath(), path))
      .filter((path) => path.endsWith(".map"));

    expect(maps).toEqual([]);
  });
});

/**
 * A port the kernel just confirmed is free, so two runs never collide and no
 * leftover process can answer a later case with stale content.
 */
function freePort(): Promise<number> {
  return new Promise((fulfil, reject) => {
    const probe = createServer();

    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      // SAFETY: the probe listens on a TCP port, so `address()` is an
      // AddressInfo rather than a string or null.
      const port = (probe.address() as AddressInfo).port;

      probe.close(() => fulfil(port));
    });
  });
}

/** One MCP message. Only the two fields this suite reads are typed. */
type McpMessage = {
  readonly id?: number;
  readonly result?: {
    readonly content?: readonly { readonly text?: string }[];
  };
};

type McpInitialize = {
  readonly jsonrpc: "2.0";
  readonly id: number;
  readonly method: "initialize";
  readonly params: {
    readonly protocolVersion: string;
    readonly capabilities: Record<string, never>;
    readonly clientInfo: { readonly name: string; readonly version: string };
  };
};

type McpInitialized = {
  readonly jsonrpc: "2.0";
  readonly method: "notifications/initialized";
};

type McpToolsCall = {
  readonly jsonrpc: "2.0";
  readonly id: number;
  readonly method: "tools/call";
  readonly params: {
    readonly name: string;
    readonly arguments: { readonly withStoryIds: boolean };
  };
};

type McpRequest = McpInitialize | McpInitialized | McpToolsCall;

/**
 * One request over the addon's streamable HTTP endpoint. A notification answers
 * with an empty body; a request answers either as JSON or as a server-sent
 * event.
 */
async function mcpPost(
  port: number,
  session: string | undefined,
  body: McpRequest
): Promise<{
  readonly session: string | undefined;
  readonly messages: readonly McpMessage[];
}> {
  const accept = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  };

  const headers =
    session === undefined ? accept : { ...accept, "mcp-session-id": session };

  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  // SAFETY: the bytes are the endpoint's own JSON-RPC reply, and each parsed
  // value is read only for its id and its tool-result content below.
  const messages: McpMessage[] =
    text.trim() === ""
      ? []
      : contentType.includes("text/event-stream")
        ? text
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => JSON.parse(line.slice(5)) as McpMessage)
        : [JSON.parse(text) as McpMessage];

  return {
    session: response.headers.get("mcp-session-id") ?? session,
    messages,
  };
}

/**
 * The addon's `docs-list` tool, driven over the real MCP protocol: initialize,
 * the initialized notification, then the tool call. Its text is the component
 * and documentation list the addon returns to an agent.
 */
async function mcpDocsList(port: number): Promise<string> {
  const init = await mcpPost(port, undefined, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "genie-storybook-matrix", version: "1" },
    },
  });

  if (init.session === undefined) {
    throw new Error("the MCP endpoint answered no session id");
  }

  await mcpPost(port, init.session, {
    jsonrpc: "2.0",
    method: "notifications/initialized",
  });

  const call = await mcpPost(port, init.session, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "docs-list", arguments: { withStoryIds: true } },
  });

  const content =
    call.messages.find((message) => message.id === 2)?.result?.content ?? [];

  return content.map((item) => item.text ?? "").join("\n");
}

type DevSurface = {
  readonly entries: readonly string[];
  readonly docs: string;
};

/**
 * Starts the development server for one selection and reads what it serves: the
 * story index, and the content the `@storybook/addon-mcp` `docs-list` tool
 * returns over the real MCP protocol. Reading the index alone would leave the
 * tool response unproved, so both are read.
 */
async function devSurface(moduleInclude: string): Promise<DevSurface> {
  const port = await freePort();

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
      // Its own process group, so the whole group can be signalled below.
      detached: true,
    }
  );

  try {
    const deadline = Date.now() + 90000;
    let lastError: unknown;
    let entries: readonly string[] | undefined;

    /* eslint-disable no-await-in-loop -- a poll must finish one attempt before the next */
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/index.json`, {
          signal: AbortSignal.timeout(2000),
        });

        if (response.ok) {
          // SAFETY: the bytes are Storybook's own index.json, and only the
          // entry keys are read.
          const body = (await response.json()) as {
            entries: Record<
              string,
              { readonly title: string; readonly type: string }
            >;
          };

          entries = Object.keys(body.entries);

          break;
        }
      } catch (error) {
        lastError = error;
      }

      await new Promise((wake) => setTimeout(wake, 500));
    }
    /* eslint-enable no-await-in-loop */

    if (entries === undefined) {
      throw new Error(
        `the Storybook development server did not answer on ${port}: ${String(lastError)}`
      );
    }

    return { entries, docs: await mcpDocsList(port) };
  } finally {
    // The dev server starts a Vite child. Killing only the parent leaves that
    // child holding the port and serving its own selection to the next case, so
    // the whole process group is signalled and the port is given back.
    if (child.pid !== undefined) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // The group is already gone.
      }
    }

    child.kill("SIGKILL");
  }
}

describe("the development server and the MCP addon", () => {
  it("serves no excluded module's stories or documentation", async () => {
    const { entries, docs } = await devSurface("");

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.filter((id) => id.startsWith("modules-"))).toEqual([]);

    // The real MCP tool call, not only the index. The UI content is present, so
    // the tool answered, and no module content is.
    expect(docs).toContain("Disclosure");
    expect(docs).not.toContain("modules-");
    expect(docs).not.toContain("placeholder:");

    for (const needle of PLACEHOLDER_NEEDLES) {
      expect(docs, needle).not.toContain(needle);
    }
  });

  it("exposes exactly the selected module's content through the MCP tool", async () => {
    const { entries, docs } = await devSurface(SECOND_ID);

    expect(entries.some((id) => id.startsWith("modules-second-fixture-"))).toBe(
      true
    );
    expect(entries.some((id) => id.startsWith("modules-placeholder-"))).toBe(
      false
    );

    expect(docs).toContain("modules-second-fixture-");
    expect(docs).not.toContain("modules-placeholder-");
    expect(docs).not.toContain("placeholder:");
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

  /**
   * Discovery reads module package metadata, and a module is not a declared
   * dependency of this host. The runtime digest covers only the id, package
   * name and entrypoint path, so a metadata-only change such as a version bump
   * moves nothing the digest sees: only a manifest input catches it.
   */
  it("invalidates the build when a module's package metadata changes", () => {
    const path = join(stage, "packages/modules", SECOND_ID, "package.json");
    const original = readFileSync(path, "utf8");

    ran(BUILD_TASK, "placeholder");

    try {
      // The fixture manifest is a known-valid constant, so the version is
      // changed by a string substitution rather than by re-encoding it.
      writeFileSync(
        path,
        SECOND_MANIFEST.replace('"version": "0.0.0"', '"version": "0.0.1"')
      );

      const changed = ran(BUILD_TASK, "placeholder");

      expect(servedFromCache(changed.output, BUILD_TASK), changed.output).toBe(
        false
      );
    } finally {
      writeFileSync(path, original);
    }
  });
});

/** How many component tests the run reported as passed. */
function passedCount(output: string): number {
  const passed = /Tests\s+(\d+) passed/.exec(output)?.[1];

  if (passed === undefined) {
    throw new Error(`the run reported no test count:\n${output}`);
  }

  return Number(passed);
}

/**
 * The real generator from S0-08, run into the stage. It is the strongest form
 * of "appears and tests with no host or CI edit": nothing in the workspace
 * names the new module, yet selection alone discovers its stories, builds them
 * into the static output, and runs them as component tests.
 *
 * It runs last, because the generated module joins the unset selection while it
 * exists. The stage's application manifest and the module folder are restored
 * afterwards.
 */
describe("a module written by the generator", () => {
  const GENERATED_ID = "generated-proof";

  it("appears in the selected static build and runs without a host or CI edit", () => {
    const appManifest = join(stage, "apps/genie/package.json");
    const originalManifest = readFileSync(appManifest, "utf8");
    const generatedRoot = join(stage, "packages/modules", GENERATED_ID);

    try {
      const generated = spawnSync(
        join(stage, "node_modules/.bin/nx"),
        ["g", "@genie/generators:module-new", GENERATED_ID],
        {
          cwd: stage,
          encoding: "utf8",
          env: { ...process.env },
          timeout: NESTED_RUN_TIMEOUT_MS,
        }
      );

      expect(generated.status, `${generated.stdout}${generated.stderr}`).toBe(
        0
      );

      // The module's stories import `@genie/ui`, so its own dependency tree has
      // to be linked the way any module is linked. This is not a host or CI
      // edit: nothing names the module, only the package manager links it. The
      // stage is disposable, so its lockfile is allowed to move, also under
      // CI=true, where pnpm otherwise defaults to a frozen lockfile.
      const install = spawnSync(
        "pnpm",
        ["install", "--ignore-scripts", "--silent", "--no-frozen-lockfile"],
        { cwd: stage, encoding: "utf8", timeout: NESTED_RUN_TIMEOUT_MS }
      );

      expect(install.status, `${install.stdout}${install.stderr}`).toBe(0);

      const prefix = `modules-${GENERATED_ID}-`;

      const selected = ran(BUILD_TASK, GENERATED_ID);

      expect(selected.status).toBe(0);
      expect(
        Object.keys(index().entries).some((id) => id.startsWith(prefix))
      ).toBe(true);

      // And it is absent from another selection's build.
      ran(BUILD_TASK, "placeholder");

      expect(
        Object.keys(index().entries).some((id) => id.startsWith(prefix))
      ).toBe(false);

      // The component tests collect the generated stories as real tests: the
      // count rises above the empty selection's, so the pass is not the host's
      // own user-interface and core stories.
      const empty = ran(TEST_TASK, "");
      const withGenerated = ran(TEST_TASK, GENERATED_ID);

      expect(passedCount(withGenerated.output)).toBeGreaterThan(
        passedCount(empty.output)
      );
    } finally {
      rmSync(generatedRoot, { recursive: true, force: true });
      writeFileSync(appManifest, originalManifest);
    }
  });
});
