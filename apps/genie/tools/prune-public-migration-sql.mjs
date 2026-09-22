// F2 prune of generated public migration SQL.
//
// A module declares its migration files with `new URL("<tag>.sql", import.meta.url)`,
// and `next build` traces that reference into two places: the server copy the
// migrator reads (`.next/server/assets/...`) and a public copy Turbopack emits
// into the static output (`.next/static/media/...`), which any client can
// download. The two are the same bytes by construction, so the static copy is a
// pure duplicate. This tool removes that duplicate after the build and keeps the
// server copy.
//
// The app's own `public` trees are authored content, never written by the build.
// A `.sql` there is refused outright — even when its bytes match a server asset,
// because a match cannot prove the file was generated — so the tool never
// deletes repository content. Every other candidate must be byte-identical to a
// server migration asset, and the server assets themselves are re-hashed after
// the prune, so an unattributable file or a changed server copy fails the build
// with nothing unlinked.

import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const SQL_SUFFIX = ".sql";

const isSqlName = (name) => name.toLowerCase().endsWith(SQL_SUFFIX);

/** True for a real file; a symlink or a directory is not one. */
function isFile(path) {
  return existsSync(path) && lstatSync(path).isFile();
}

/**
 * Refuses a path whose components below `root` are not all real directories. A
 * symlinked ancestor would let the tool read or unlink outside the app root
 * through one of its own roots, so it is rejected rather than followed. A
 * missing component is not an error: the caller skips a root that is absent.
 */
function assertRealPathWithinRoot(root, target) {
  const path = relative(root, target);

  if (path === "") return;

  if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)) {
    throw new Error(`refusing to read outside the app root: ${target}`);
  }

  let current = root;

  for (const segment of path.split(sep)) {
    current = join(current, segment);

    if (!existsSync(current)) return;

    if (lstatSync(current).isSymbolicLink()) {
      throw new Error(`refusing to follow a symlink at ${current}`);
    }
  }
}

/** Regular `.sql` files under a non-served root; symlinks are skipped, not followed. */
function collectSqlFiles(root) {
  const found = [];

  const walk = (dir) => {
    if (!existsSync(dir)) return;

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;

      if (entry.name === "node_modules") continue;

      const child = join(dir, entry.name);

      if (entry.isDirectory()) walk(child);
      else if (entry.isFile() && isSqlName(entry.name)) found.push(child);
    }
  };

  walk(root);

  return found.toSorted();
}

/**
 * `.sql` files under a served output. ANY symlink beneath a served output fails
 * the run: following it could read or unlink out of the build, and skipping it
 * would make the inventory incomplete, so neither is allowed.
 */
function collectServedSqlFiles(root) {
  const found = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) {
        throw new Error(
          `refusing to follow a symlink under a served output: ${join(dir, entry.name)}`
        );
      }

      const child = join(dir, entry.name);

      if (entry.isDirectory()) walk(child);
      else if (entry.isFile() && isSqlName(entry.name)) found.push(child);
    }
  };

  if (existsSync(root)) walk(root);

  return found.toSorted();
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/**
 * The one standalone app root under `.next/standalone`. Zero entries means the
 * build emitted no server, and several means a "first" pick would silently
 * scope the whole prune to one arbitrary build; both are malformed.
 */
function findStandaloneRoot(standaloneDir) {
  const roots = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;

      if (entry.name === "node_modules") continue;

      const child = join(dir, entry.name);

      if (entry.isDirectory()) walk(child);
      else if (entry.isFile() && entry.name === "server.js") roots.push(dir);
    }
  };

  walk(standaloneDir);

  if (roots.length !== 1) {
    throw new Error(
      `expected exactly one server.js under ${standaloneDir}, found ${roots.length}`
    );
  }

  return roots[0];
}

/**
 * Removes every generated public migration SQL file that is byte-identical to a
 * server migration asset, under the app's known build-output roots only, and
 * refuses everything it cannot attribute.
 *
 * @param {string} appRoot the application directory whose `.next` build is pruned
 * @returns {{ removedPublicSql: readonly string[], preservedServerSql: readonly string[] }}
 */
export function prunePublicMigrationSql(appRoot) {
  const root = resolve(appRoot);
  const mainNext = join(root, ".next");

  assertRealPathWithinRoot(root, mainNext);

  // A concrete build artifact is required: an absent or malformed build must
  // fail, never pass as an empty selection with nothing to prune.
  if (!isFile(join(mainNext, "BUILD_ID"))) {
    throw new Error(
      `no Next build at ${mainNext}: .next/BUILD_ID is missing or not a file`
    );
  }

  const standaloneDir = join(mainNext, "standalone");
  const nextDirs = [mainNext];
  let standaloneRoot;

  if (existsSync(standaloneDir)) {
    assertRealPathWithinRoot(root, standaloneDir);

    standaloneRoot = findStandaloneRoot(standaloneDir);

    const standaloneNext = join(standaloneRoot, ".next");

    assertRealPathWithinRoot(root, standaloneNext);

    if (!isFile(join(standaloneNext, "BUILD_ID"))) {
      throw new Error(
        `standalone build at ${standaloneNext} has no .next/BUILD_ID file`
      );
    }

    nextDirs.push(standaloneNext);
  }

  // Server assets are read; static outputs are the generated prune candidates;
  // the app's public trees are authored content that is never deleted.
  const serverRoots = nextDirs.map((dir) => join(dir, "server", "assets"));
  const staticRoots = nextDirs.map((dir) => join(dir, "static"));
  const authoredRoots = [join(root, "public")];

  if (standaloneRoot !== undefined) {
    authoredRoots.push(join(standaloneRoot, "public"));
  }

  for (const servedRoot of [...serverRoots, ...staticRoots, ...authoredRoots]) {
    assertRealPathWithinRoot(root, servedRoot);
  }

  const serverSql = serverRoots.flatMap((dir) => collectSqlFiles(dir));

  const authoredSql = authoredRoots.flatMap((dir) =>
    collectServedSqlFiles(dir)
  );

  const staticSql = staticRoots.flatMap((dir) => collectServedSqlFiles(dir));

  // Validate the whole set before unlinking a single file: an authored or
  // unattributable SQL file fails the build with everything still in place.
  if (authoredSql.length > 0) {
    throw new Error(
      `refusing to touch authored public SQL: ${authoredSql.join(", ")}`
    );
  }

  const serverHashes = new Set(serverSql.map(sha256));

  for (const file of staticSql) {
    if (!serverHashes.has(sha256(file))) {
      throw new Error(
        `refusing to prune ${file}: no byte-identical server migration asset under ${serverRoots.join(", ")}`
      );
    }
  }

  const serverHashesBefore = new Map(
    serverSql.map((file) => [file, sha256(file)])
  );

  for (const file of staticSql) rmSync(file);

  for (const [file, hash] of serverHashesBefore) {
    if (!isFile(file) || sha256(file) !== hash) {
      throw new Error(`server migration asset changed or vanished: ${file}`);
    }
  }

  const leftovers = staticRoots.flatMap((dir) => collectServedSqlFiles(dir));

  if (leftovers.length > 0) {
    throw new Error(
      `public migration SQL survived the prune: ${leftovers.join(", ")}`
    );
  }

  return {
    removedPublicSql: staticSql.toSorted(),
    preservedServerSql: serverSql.toSorted(),
  };
}

function main() {
  try {
    prunePublicMigrationSql(process.cwd());
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main();
}
