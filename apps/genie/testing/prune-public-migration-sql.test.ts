import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

/**
 * Controls for the F2 prune tool (Candidate B), driven entirely through temp
 * build-output fixtures under the operating system's temporary directory: no
 * repository file is ever deleted, and no Docker or real build is involved.
 *
 * The contract under test: after `next build`, the tool removes a public SQL
 * file ONLY when it is byte-identical to a server asset — the generated
 * duplication F2 named — and refuses loudly (deleting nothing) on authored
 * SQL, unexpected SQL, missing or malformed build output, or anything it
 * cannot attribute. Server assets are the authority: their bytes must survive
 * exactly. The tool knows nothing about which module or migration the SQL
 * belongs to — no registry, no core APIs — so these fixtures use synthetic
 * bytes.
 *
 * The named export is loaded through a dynamic specifier so this file runs —
 * and fails, naming the missing module — before the tool exists. That is the
 * RED this lane delivers; the source owner implements to green.
 */

type PruneResult = {
  readonly removedPublicSql: readonly string[];
  readonly preservedServerSql: readonly string[];
};

type PruneTool = (appRoot: string) => PruneResult;

/** File URL, for importing the module's named export. */
const TOOL_MODULE_URL = new URL(
  "../tools/prune-public-migration-sql.mjs",
  import.meta.url
).href;

/** Plain path, for spawning the module as the documented CLI. */
const TOOL = resolve(
  import.meta.dirname,
  "../tools/prune-public-migration-sql.mjs"
);

/** The tool module, loaded late so the RED names the absent file itself. */
async function loadTool(): Promise<PruneTool> {
  // SAFETY: the specifier is the constant above — the tool's own published
  // path — and the returned shape is pinned by the type below against the
  // seam the source owner confirmed.
  const loaded = (await import(TOOL_MODULE_URL)) as {
    prunePublicMigrationSql: PruneTool;
  };

  return loaded.prunePublicMigrationSql;
}

const SERVER_SQL = "CREATE TABLE fixture_record (id int);\n";

/** The build-output files of one fixture, keyed by their repository-relative paths. */
interface FixtureFiles {
  [relative: string]: string;
}

/**
 * The canonical valid build output the fixtures mutate, laid out as the real
 * `next build` emits it (measured in apps/genie/.next): the SERVER copies of
 * the migration SQL live under `.next/server/assets/` and are never served,
 * while the generated duplicates under any `static` path segment — and in
 * `public/` — are the F2 exposure the tool removes.
 */
function validFixtureFiles(): FixtureFiles {
  const files: FixtureFiles = {
    ".next/BUILD_ID": "fixture-build-1\n",
    ".next/server/assets/0000_fixture.sql": SERVER_SQL,
    ".next/static/media/0000_fixture.sql": SERVER_SQL,
    ".next/static/chunks/app.js": "console.log(1);\n",
    ".next/standalone/apps/genie/server.js": "// standalone entry\n",
    ".next/standalone/apps/genie/.next/BUILD_ID": "fixture-build-1\n",
    ".next/standalone/apps/genie/.next/server/assets/0000_fixture.sql":
      SERVER_SQL,
    ".next/standalone/apps/genie/.next/static/media/0000_fixture.sql":
      SERVER_SQL,
    "public/robots.txt": "user-agent: *\n",
  };

  return files;
}

const createdFixtures: string[] = [];

function makeFixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "prune-fixture-"));

  for (const [relative, content] of Object.entries(files)) {
    const target = join(root, relative);

    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  createdFixtures.push(root);

  return root;
}

function listFiles(root: string): readonly string[] {
  const files: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;

      const child = join(dir, entry.name);

      if (entry.isDirectory()) walk(child);
      else if (statSync(child).isFile()) files.push(child);
    }
  };

  walk(root);

  return files.map((file) => file.slice(root.length + 1));
}

function sha256Of(path: string): string {
  return createHash("sha256").update(readFileSync(path, "utf8")).digest("hex");
}

afterAll(() => {
  for (const root of createdFixtures) {
    // Exact owned temp path per fixture; nothing outside this list is touched.
    rmSync(root, { recursive: true, force: true });
  }
});

describe("the prune-public-migration-sql tool", () => {
  it("prunes a public migration sql that is byte-identical to a server asset", async () => {
    const root = makeFixture(validFixtureFiles());

    const result = await (await loadTool())(root);

    expect([...result.removedPublicSql].toSorted()).toEqual(
      [
        ".next/static/media/0000_fixture.sql",
        ".next/standalone/apps/genie/.next/static/media/0000_fixture.sql",
      ]
        .map((relative) => join(root, relative))
        .toSorted()
    );
    expect([...result.preservedServerSql].toSorted()).toEqual(
      [
        ".next/server/assets/0000_fixture.sql",
        ".next/standalone/apps/genie/.next/server/assets/0000_fixture.sql",
      ]
        .map((relative) => join(root, relative))
        .toSorted()
    );

    // The public duplicates are gone; the server assets are byte-intact.
    for (const removed of result.removedPublicSql) {
      expect(existsSync(removed)).toBe(false);
    }

    for (const preserved of result.preservedServerSql) {
      expect(readFileSync(preserved, "utf8")).toBe(SERVER_SQL);
    }
  });

  it("fails and preserves everything when public sql bytes match a server asset", async () => {
    // public/ is the authored zone: a byte-identical match to a server asset
    // cannot distinguish a generated duplicate from a hand-placed file, so
    // the tool must refuse rather than delete repository content.
    const files = validFixtureFiles();

    files["public/0000_fixture.sql"] = SERVER_SQL;

    const root = makeFixture(files);
    const before = listFiles(root);

    const tool = await loadTool();

    expect(() => tool(root)).toThrow();

    expect(listFiles(root)).toEqual(before);
  });

  it("fails and preserves everything when standalone public sql bytes match a server asset", async () => {
    // The standalone public tree is a copy of the authored one, so the same
    // rejection applies there: a byte-identical match cannot prove the file
    // is generated, and public trees are never deleted.
    const files = validFixtureFiles();

    files[".next/standalone/apps/genie/public/0000_fixture.sql"] = SERVER_SQL;

    const root = makeFixture(files);
    const before = listFiles(root);

    const tool = await loadTool();

    expect(() => tool(root)).toThrow();

    expect(listFiles(root)).toEqual(before);
  });

  it("rejects static sql with no byte-identical server asset and deletes nothing", async () => {
    const files = validFixtureFiles();

    files[".next/static/media/0000_authored.sql"] =
      "CREATE TABLE other_record (id int);\n";

    const root = makeFixture(files);
    const before = listFiles(root);

    const tool = await loadTool();

    expect(() => tool(root)).toThrow();

    expect(listFiles(root)).toEqual(before);
  });

  it("rejects authored sql under public and deletes nothing", async () => {
    const files = validFixtureFiles();

    files["public/hand-written.sql"] = "-- hand authored, served verbatim\n";

    const root = makeFixture(files);
    const before = listFiles(root);

    const tool = await loadTool();

    expect(() => tool(root)).toThrow();

    expect(listFiles(root)).toEqual(before);
    expect(readFileSync(join(root, "public/hand-written.sql"), "utf8")).toBe(
      "-- hand authored, served verbatim\n"
    );
  });

  it("throws when the build output is missing or malformed", async () => {
    const missing = makeFixture({
      "public/0000_fixture.sql": SERVER_SQL,
    });

    const tool = await loadTool();

    expect(() => tool(missing)).toThrow();

    // Malformed: BUILD_ID present but a directory, not the build's own file.
    const malformed = makeFixture(validFixtureFiles());

    rmSync(join(malformed, ".next/BUILD_ID"));
    mkdirSync(join(malformed, ".next/BUILD_ID"), { recursive: true });

    expect(() => tool(malformed)).toThrow();

    // Neither run may have passed as an empty selection: every sql is intact.
    expect(readFileSync(join(missing, "public/0000_fixture.sql"), "utf8")).toBe(
      SERVER_SQL
    );
  });

  it("ignores sql under node_modules outside the served outputs", async () => {
    // The dependency tree at the app root is not served by anything: its SQL
    // is neither a server asset, nor a public duplicate, nor authored public
    // content, so the tool has no contract with it at all.
    const files = validFixtureFiles();

    files["node_modules/pkg/static/0000_other.sql"] =
      "CREATE TABLE nested (id int);\n";

    const root = makeFixture(files);
    const before = listFiles(root);

    const result = await (await loadTool())(root);

    // The generated duplicates under the static roots are still pruned
    // exactly as in the valid build; the dependency tree must not appear in
    // the result and must survive untouched.
    expect([...result.removedPublicSql].toSorted()).toEqual(
      [
        ".next/static/media/0000_fixture.sql",
        ".next/standalone/apps/genie/.next/static/media/0000_fixture.sql",
      ]
        .map((relative) => join(root, relative))
        .toSorted()
    );
    expect(
      result.removedPublicSql.some((path) => path.includes("node_modules"))
    ).toBe(false);
    expect(listFiles(root)).toEqual(
      before.filter(
        (relative) =>
          !relative.endsWith("0000_fixture.sql") || relative.includes("server")
      )
    );
  });

  it("treats node_modules inside served static as served bytes", async () => {
    // Serving is path-based, not name-based: Next serves everything under
    // .next/static at /_next/static, whatever the folders are called. A
    // node_modules-named directory there is served exposure, so an unmatched
    // sql inside it must fail the tool like any other unmatched public sql.
    const files = validFixtureFiles();

    files[".next/static/media/node_modules/0000_served.sql"] =
      "CREATE TABLE served_nested (id int);\n";

    const root = makeFixture(files);
    const before = listFiles(root);

    const tool = await loadTool();

    expect(() => tool(root)).toThrow();

    expect(listFiles(root)).toEqual(before);
  });

  it("succeeds as a no-op when the build contains no migration sql", async () => {
    const files = validFixtureFiles();

    for (const name of Object.keys(files)) {
      if (name.endsWith(".sql")) delete files[name];
    }

    const root = makeFixture(files);
    const before = listFiles(root);

    const result = await (await loadTool())(root);

    expect(result.removedPublicSql).toEqual([]);
    expect(result.preservedServerSql).toEqual([]);
    expect(listFiles(root)).toEqual(before);
  });

  it("collects uppercase sql spellings", async () => {
    const files = validFixtureFiles();

    delete files[".next/static/media/0000_fixture.sql"];
    delete files[
      ".next/standalone/apps/genie/.next/static/media/0000_fixture.sql"
    ];
    files[".next/static/media/0000_fixture.SQL"] = SERVER_SQL;

    const root = makeFixture(files);

    const result = await (await loadTool())(root);

    // The .SQL spelling is collected exactly like its lowercase sibling; the
    // fixture's other byte-identical public duplicates are legitimately
    // collected alongside it, so membership is the contract here.
    expect(result.removedPublicSql).toContain(
      join(root, ".next/static/media/0000_fixture.SQL")
    );
    expect(existsSync(join(root, ".next/static/media/0000_fixture.SQL"))).toBe(
      false
    );
  });

  it("unlinks only the collected files and preserves server bytes", async () => {
    const root = makeFixture(validFixtureFiles());

    const serverCopies = [
      join(root, ".next/server/assets/0000_fixture.sql"),
      join(
        root,
        ".next/standalone/apps/genie/.next/server/assets/0000_fixture.sql"
      ),
    ];

    const hashesBefore = serverCopies.map(
      (file) => [file, sha256Of(file)] as const
    );

    await (
      await loadTool()
    )(root);

    // Everything that was not a collected public duplicate still exists, and
    // the server assets hash exactly as before the call.
    expect(listFiles(root)).toContain(".next/static/chunks/app.js");
    expect(listFiles(root)).toContain("public/robots.txt");

    for (const [file, hash] of hashesBefore) {
      expect(sha256Of(file)).toBe(hash);
    }
  });

  it("fails closed on symlinks under served outputs and preserves link and target", async () => {
    const root = makeFixture(validFixtureFiles());

    const outside = makeFixture({
      "outside.sql": "CREATE TABLE outside (id int);\n",
    });

    const outsideSql = join(outside, "outside.sql");

    const link = join(root, ".next/static/media/linked.sql");

    try {
      symlinkSync(outsideSql, link);
    } catch {
      // Environments without symlink privilege are not the contract here.
    }

    const before = listFiles(root);

    const tool = await loadTool();

    // A link under the served outputs must stop the tool before any
    // deletion: following it could read or unlink out of the build, and
    // skipping it would make the inventory incomplete. Either way the proof
    // fails closed, with the link and its target preserved.
    expect(() => tool(root)).toThrow();

    expect(existsSync(link)).toBe(true);
    expect(readFileSync(outsideSql, "utf8")).toBe(
      "CREATE TABLE outside (id int);\n"
    );
    expect(listFiles(root)).toEqual(before);
  });

  it("fails closed when build roots are symlinked", async () => {
    // Ancestor symlinks are the same hole one level up: a .next or
    // standalone-app symlink would let the tool read and unlink outside the
    // build through its own roots, so their presence must fail the run.
    const outside = makeFixture({
      "apps/genie/server.js": "// outside entry\n",
    });

    const root = makeFixture(validFixtureFiles());

    rmSync(join(root, ".next"), { recursive: true, force: true });

    const nextLink = join(root, ".next");

    try {
      symlinkSync(outside, nextLink);
    } catch {
      // Environments without symlink privilege are not the contract here.
    }

    const tool = await loadTool();

    expect(() => tool(root)).toThrow();

    expect(readFileSync(join(outside, "apps/genie/server.js"), "utf8")).toBe(
      "// outside entry\n"
    );
  });

  it("throws when the standalone tree has zero or multiple server.js roots", async () => {
    // Zero roots: the standalone directory is present but the build emitted
    // no server entry, so the served-static inventory would be a guess.
    const zero = makeFixture(validFixtureFiles());

    rmSync(join(zero, ".next/standalone/apps/genie/server.js"));

    const tool = await loadTool();

    expect(() => tool(zero)).toThrow();

    // Multiple roots: a sorted "first" pick would silently scope the whole
    // prune to one arbitrary build.
    const multiple = makeFixture(validFixtureFiles());

    const second = join(
      multiple,
      ".next/standalone/apps/genie/other/server.js"
    );

    mkdirSync(dirname(second), { recursive: true });
    writeFileSync(second, "// second entry\n");

    expect(() => tool(multiple)).toThrow();
  });

  it("the cli exits 0 on success and 1 on validation failure", () => {
    const valid = makeFixture(validFixtureFiles());

    const files = validFixtureFiles();

    files["public/hand-written.sql"] = "-- hand authored\n";

    const invalid = makeFixture(files);

    const validRun = spawnSync(process.execPath, [TOOL], {
      cwd: valid,
      encoding: "utf8",
    });

    expect(validRun.status).toBe(0);

    const invalidRun = spawnSync(process.execPath, [TOOL], {
      cwd: invalid,
      encoding: "utf8",
    });

    expect(invalidRun.status).toBe(1);
    expect(invalidRun.stderr.trim()).not.toBe("");
  });
});
