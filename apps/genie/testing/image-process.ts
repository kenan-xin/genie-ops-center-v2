import { execFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** The image every integration test drives. */
export const IMAGE = "genie-s005:test";

/**
 * Fails closed when the Docker daemon is unreachable.
 *
 * The image matrix is the only proof the customer image contract has, and a run
 * that quietly passed because the daemon was down would report the opposite of
 * the truth. This throws a named, actionable diagnostic instead, so a red run
 * says exactly what is missing rather than surfacing a confusing container
 * error. It never skips.
 */
export async function requireDocker(): Promise<string> {
  try {
    const { stdout } = await run("docker", [
      "info",
      "--format",
      "{{.ServerVersion}}",
    ]);

    const version = stdout.trim();

    if (version === "") {
      throw new Error("docker info returned no server version");
    }

    return version;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    throw new Error(
      `Docker is not available, so the image matrix cannot run and must not pass. Start the Docker daemon (for example, launch Docker Desktop) and re-run. Underlying error: ${detail}`,
      { cause: error }
    );
  }
}

/**
 * Builds one selection into one tag and reports whether the build succeeded.
 * The Dockerfile copies the whole workspace, so an unchanged context is a
 * content-addressed cache hit; a changed one rebuilds.
 */
export async function buildImageWith(
  moduleInclude: string,
  tag: string
): Promise<boolean> {
  try {
    await run(
      "docker",
      [
        "build",
        "--quiet",
        "-f",
        "deploy/Dockerfile",
        "--build-arg",
        `MODULE_INCLUDE=${moduleInclude}`,
        "-t",
        tag,
        ".",
      ],
      { cwd: WORKSPACE_ROOT, maxBuffer: 64 * 1024 * 1024 }
    );

    return true;
  } catch {
    return false;
  }
}

/** The `ARG` names a history declares, so a base image's own args can be ignored. */
export function argNamesInHistory(
  history: readonly { readonly createdBy: string }[]
): readonly string[] {
  const names: string[] = [];

  for (const entry of history) {
    const declared = /^ARG ([A-Za-z_][A-Za-z0-9_]*)$/.exec(
      entry.createdBy.trim()
    );

    if (declared !== null && declared[1] !== undefined) names.push(declared[1]);
  }

  return names;
}

/** The committed history lines of an image, one per layer. */
export async function dockerHistory(
  id: string
): Promise<readonly { readonly createdBy: string }[]> {
  const { stdout } = await run(
    "docker",
    ["history", "--no-trunc", "--format", "{{.CreatedBy}}", id],
    { maxBuffer: 32 * 1024 * 1024 }
  );

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((createdBy) => ({ createdBy }));
}

/**
 * Every file path in the image's application tree, as `{ path, content: "" }`.
 *
 * This is a path inventory: the exclusion and dev-tooling contract is decided by
 * what is present, and the migration and secret content checks reuse the public
 * corpus scan, which reads the bytes the image actually serves. Reading every
 * file body here would ship the whole runtime tree out of the container for no
 * extra assurance.
 */
export async function imageFilePaths(
  id: string
): Promise<readonly { readonly path: string; readonly content: string }[]> {
  const { stdout } = await run(
    "docker",
    ["exec", id, "find", "/app", "-type", "f"],
    { maxBuffer: 64 * 1024 * 1024 }
  );

  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((path) => ({ path, content: "" }));
}

/**
 * The five security headers R-47 fixes, and the one health body R-36a fixes.
 * The values are the contract, not a shape: a header present with a weaker value
 * must fail.
 */
export const REQUIRED_HEADERS = {
  "content-security-policy":
    "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'",
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
} as const;

/** Alias mapped to the host gateway, so a container can reach the host database. */
export const HOST_ALIAS = "host.docker.internal";

/**
 * Rewrites a host-side database URL into one the container can reach.
 *
 * The disposable database is published on this host, so inside a container
 * `localhost` is the container itself and the connection is refused. The alias
 * is mapped to the host gateway on the command line, which works on a plain
 * Linux daemon and on Docker Desktop alike.
 */
export function reachableFromContainer(url: string): string {
  const parsed = new URL(url);

  if (["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    parsed.hostname = HOST_ALIAS;
  }

  return parsed.toString();
}

/**
 * Starts the image and returns its container id and a log reader.
 *
 * `--rm` is deliberately absent. A container started with `--rm` is removed the
 * instant it exits, so `docker logs` on a failed bootstrap returns nothing and
 * every log assertion passes vacuously. The container is removed explicitly in
 * `stop()` after the logs have been read.
 *
 * The port is published rather than shared with `--network=host`. Host
 * networking only shares this host's namespace on a plain Linux daemon. Under
 * Docker Desktop it joins the daemon's own virtual machine instead, so the
 * container starts and migrates correctly while every assertion that fetches it
 * fails to connect. That failure reads exactly like a broken application, which
 * cost this ticket a full debugging cycle.
 */
export async function startImage(
  env: Record<string, string>,
  port: number,
  tag: string = IMAGE
) {
  const args = [
    "run",
    "-d",
    "-p",
    `${port}:3000`,
    "--add-host",
    `${HOST_ALIAS}:host-gateway`,
  ];

  for (const [key, value] of Object.entries(env)) {
    const reachable =
      key === "DATABASE_URL" ? reachableFromContainer(value) : value;

    args.push("-e", `${key}=${reachable}`);
  }

  args.push(tag);

  const { stdout } = await run("docker", args);
  const id = stdout.trim();

  return {
    id,
    logs: async () => {
      const result = await run("docker", ["logs", id]).catch(() => ({
        stdout: "",
        stderr: "",
      }));

      return result.stdout + result.stderr;
    },
    stop: () => run("docker", ["rm", "-f", id]).catch(() => undefined),
  };
}

export type RunningImage = Awaited<ReturnType<typeof startImage>>;

/**
 * Reads the container log until it satisfies `ready`, or the budget expires.
 *
 * A single read races the logger's own flush. The server answers the request
 * before pino has written the line, so a test that fetches and then reads once
 * sees a log that is correct but not yet complete, and fails intermittently on
 * an application that is behaving.
 *
 * The final read is returned either way, so a genuine absence still fails the
 * assertion that follows, with the whole log to look at.
 */
export async function logsUntil(
  image: { logs: () => Promise<string> },
  ready: (logs: string) => boolean,
  budgetMs = 15000
): Promise<string> {
  const deadline = Date.now() + budgetMs;

  // Polling is sequential by definition: each read exists only because the
  // previous one was incomplete. Running the reads in parallel would ask the
  // same question of the same moment several times over.
  /* eslint-disable no-await-in-loop */
  let logs = await image.logs();

  while (!ready(logs) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));

    logs = await image.logs();
  }
  /* eslint-enable no-await-in-loop */

  return logs;
}

/**
 * Reads the container log until `marker` appears, and returns the whole log.
 *
 * This is a log barrier, and it is deliberately strict: a budget expiry THROWS
 * instead of returning the final non-matching read. A barrier that quietly
 * times out would hand the caller a log that simply lacks the line, and every
 * measurement taken "past" it would be a fiction — a zero counted in a window
 * that was never established. The marker must be a string unique to the
 * request being waited for, such as its request id inside its own request
 * line.
 *
 * Ordering guarantee: the application logs through one pino destination in one
 * process, so the byte order of the container log is the order of logging
 * calls. Any line logged before the request that produced `marker` — a viewer
 * request's provider line among them — precedes the marker in the byte stream.
 * That is what makes the marker usable as a flush barrier for everything that
 * happened before it, which a target request's own marker cannot do: the proxy
 * writes a request's line before that request's provider runs.
 */
export async function logsUntilOrThrow(
  image: { logs: () => Promise<string> },
  marker: string,
  budgetMs = 15000
): Promise<string> {
  const deadline = Date.now() + budgetMs;

  // Polling is sequential by definition: each read exists only because the
  // previous one did not contain the marker yet.
  /* eslint-disable no-await-in-loop */
  let logs = await image.logs();

  while (!logs.includes(marker) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));

    logs = await image.logs();
  }
  /* eslint-enable no-await-in-loop */

  if (!logs.includes(marker)) {
    throw new Error(
      `The log barrier was never observed within ${budgetMs}ms (marker ${marker}). Nothing past this point is proven, so the proof fails here rather than measuring a window that does not exist.`
    );
  }

  return logs;
}

/**
 * Counts the needle lines logged strictly after the `checkpoint` log was read
 * and before the line carrying `marker`, which is the exact window the
 * checkpoint and the barrier establish.
 *
 * The container log is append-only, so `checkpoint` must be a byte prefix of
 * `logs`; a checkpoint that is not a prefix means the log moved underneath the
 * measurement and this throws rather than attributing lines to the wrong
 * request.
 */
export function countInWindow(
  logs: string,
  checkpoint: string,
  marker: string,
  needle: string
): number {
  if (!logs.startsWith(checkpoint)) {
    throw new Error(
      "The container log is not append-only relative to the checkpoint; the measurement window is undefined."
    );
  }

  const markerAt = logs.indexOf(marker);

  if (markerAt === -1) {
    throw new Error(
      "The barrier marker is absent from the log; the measurement window is undefined."
    );
  }

  return countLines(logs.slice(checkpoint.length, markerAt), needle);
}

export async function pollHealth(port: number, attempts = 60) {
  const seen: { elapsed: number; status: number | null }[] = [];
  const startedAt = Date.now();

  // Polling is sequential by definition: each attempt exists only because the
  // previous one did not answer 200, and the elapsed time it records is the
  // measurement. Running the attempts in parallel would fire every request at
  // once and destroy the timeline this test reads.
  /* eslint-disable no-await-in-loop */
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await fetch(`http://127.0.0.1:${port}/api/health`)
      .then((response) => response.status)
      .catch(() => null);

    seen.push({ elapsed: Date.now() - startedAt, status });

    if (status === 200) break;

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  /* eslint-enable no-await-in-loop */

  return seen;
}

export const countLines = (logs: string, needle: string) =>
  logs.split("\n").filter((line) => line.includes(needle)).length;

/** The repository root, which holds the Dockerfile and the context it builds from. */
export const WORKSPACE_ROOT = resolvePath(import.meta.dirname, "../../..");

/**
 * F2: no migration SQL may be publicly downloadable or travel in browser
 * bundles, while the same image must still migrate a real database from the
 * repository's SQL. These cases are mechanism-independent: they derive what to
 * look for from the repository's own journals and SQL files, probe the URLs
 * and corpus the built image actually serves, and pin the real-database ledger
 * hashes against the repository sources — so any repair that hides the SQL by
 * breaking migrations, or any repair that leaves it reachable in any encoding,
 * fails here.
 *
 * The corpus is what the image actually serves, not a glob of the build
 * output: the home document, the static assets and chunks it references, and
 * the assets those chunks reference in turn. The scanner checks raw bodies,
 * newline-escaped bodies (SQL carried as a JavaScript string literal), and
 * base64-encoded tokens (SQL carried as encoded bytes), and the control case
 * proves the scanner sees both a raw and an encoded form in the same corpus
 * shape — a scan that could never match anything proves nothing.
 */

/** True for a usable non-empty string field of a checked-in journal. */
export function isNonEmptyJournalField(value: unknown): value is string {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the boundary parse of journal bytes
  return typeof value === "string" && value.trim() !== "";
}

/** Every module journal entry's SQL in the repository, with its module and tag. */
export function moduleMigrationSources(): readonly {
  module: string;
  tag: string;
  sql: string;
}[] {
  const modulesRoot = join(WORKSPACE_ROOT, "packages/modules");
  const sources: { module: string; tag: string; sql: string }[] = [];

  if (!existsSync(modulesRoot)) return sources;

  for (const entry of readdirSync(modulesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const module = entry.name;

    const journalPath = join(modulesRoot, module, "drizzle/meta/_journal.json");

    if (!existsSync(journalPath)) continue;

    // SAFETY: the journal is this repository's own checked-in drizzle-kit
    // output; the one field read is `entries[].tag`, validated as a string
    // before it names a file.
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
      entries?: { tag?: unknown }[];
    };

    for (const journalEntry of journal.entries ?? []) {
      const tag = journalEntry.tag;

      if (!isNonEmptyJournalField(tag)) continue;

      const sqlPath = join(modulesRoot, module, "drizzle", `${tag}.sql`);

      if (!existsSync(sqlPath)) continue;

      sources.push({ module, tag, sql: readFileSync(sqlPath, "utf8") });
    }
  }

  return sources;
}

/**
 * Whitespace-normalized text. The scanner compares this form of the repository
 * SQL against this form of the served bodies, so reformatted, minified, or
 * newline-escaped (string-literal) SQL still matches its source.
 */
export const normalizeSqlText = (text: string): string =>
  text.replace(/\\s+/g, " ").trim();

type MigrationSqlSource = {
  readonly module: string;
  readonly tag: string;
  /** The repository's SQL bytes as written, before any normalization. */
  readonly raw: string;
  readonly normalized: string;
};

/**
 * The repository's migration SQL in normalized form — the scanner's needles.
 *
 * Fail-closed precondition: a journal entry whose SQL normalizes to empty is
 * a malformed migration file, and scanning with no needle would be a vacuous
 * contract, so the proof refuses to run. Short-but-nonempty SQL is legal —
 * SELECT 1; is a migration — and stays covered by the same containment scan.
 */
export function asScannerSource(
  module: string,
  tag: string,
  sql: string
): MigrationSqlSource {
  const normalized = normalizeSqlText(sql);

  // Honest risk: a very short needle (SELECT 1;) can match incidental build
  // strings, so a corpus-scan failure on a short migration names the URL for
  // review rather than silently widening the contract.
  if (normalized === "") {
    throw new Error(
      `the migration SQL of ${module}/${tag} is empty; scanning it would be a vacuous contract, so the proof fails closed`
    );
  }

  return { module, tag, raw: sql, normalized };
}

export const SQL_SOURCES: readonly MigrationSqlSource[] =
  moduleMigrationSources().map(({ module, tag, sql }) =>
    asScannerSource(module, tag, sql)
  );

/** The migration URL the F2 evidence recorded against this defect. */
export const F2_RECORDED_URL =
  "/_next/static/media/0000_boring_gargoyle.3-bu8-fe23s4p.sql";

/**
 * The image's complete public corpus, read from the container itself: every
 * file under the standalone server's `.next/static` and `public` directories,
 * keyed by the URL path it is served at, plus the served home document. A
 * home-page crawl is not completeness — today's defect URL is referenced by
 * nothing — so the inventory is the container's real file list, read in one
 * exec and bounded only by what the build actually emitted. A symlink under
 * the scanned roots is rejected with a named diagnostic — an inventory that
 * silently skipped links would not be complete, and a link out of the roots
 * must never be traversed — so the current artifact, which has none, passes
 * unchanged.
 *
 * Honest scope: this detects SQL carried verbatim, as escaped string
 * literals, or as base64-encoded tokens. It does not decompress compressed
 * assets or decode arbitrary encodings; if the repair ships SQL behind an
 * exotic encoding, this scanner will not see it — say so in review rather
 * than widening the contract silently.
 */
export type InventoryEntry = { readonly url: string; readonly b64: string };

/**
 * Parses the inventory exec's output into corpus entries. A symlink record —
 * emitted by the container walk for any link under the scanned roots — fails
 * here with its path and target named: the corpus would be incomplete if the
 * link were silently skipped, and untraversable if it were followed.
 */
/**
 * True for a usable non-empty string field of an inventory line. The same
 * boundary parse as the manifest validator's report fields, for the same
 * reason.
 */
export function isNonEmptyInventoryField(value: unknown): value is string {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the boundary parse of inventory bytes
  return typeof value === "string" && value.trim() !== "";
}

export function inventoryEntries(stdout: string): readonly InventoryEntry[] {
  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      // SAFETY: each line is one JSON object emitted by the container's own
      // walk; the fields are used exactly as produced and re-validated below.
      const parsed = JSON.parse(line) as {
        url?: unknown;
        b64?: unknown;
        symlink?: unknown;
        target?: unknown;
      };

      if (isNonEmptyInventoryField(parsed.symlink)) {
        throw new Error(
          `the public corpus contains a symlink (${parsed.symlink} -> ${String(parsed.target)}); the inventory would be incomplete, so the proof fails closed`
        );
      }

      if (
        !isNonEmptyInventoryField(parsed.url) ||
        !isNonEmptyInventoryField(parsed.b64)
      ) {
        throw new Error(`malformed inventory line: ${line}`);
      }

      return { url: parsed.url, b64: parsed.b64 };
    });
}

export async function collectImagePublicCorpus(
  containerId: string,
  baseUrl: string
): Promise<Map<string, string>> {
  const script = `
    const fs = require("node:fs");
    const path = require("node:path");
    const { execFileSync } = require("node:child_process");
    const found = execFileSync("find", ["/app", "-maxdepth", "4", "-name", "server.js", "-not", "-path", "*/node_modules/*"], { encoding: "utf8" }).trim().split("\\n").filter(Boolean);
    if (found.length !== 1) { throw new Error("expected exactly one standalone server.js, found " + found.length); }
    const root = path.dirname(found[0]);
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) { console.log(JSON.stringify({ symlink: p, target: fs.readlinkSync(p) })); continue; }
        if (entry.isDirectory()) walk(p);
        else if (entry.isFile()) files.push(p);
      }
    };
    for (const dir of [path.join(root, ".next", "static"), path.join(root, "public")]) {
      if (fs.existsSync(dir)) walk(dir);
    }
    const relative = path.relative.bind(path);
    for (const file of files) {
      const rel = relative(root, file).split(path.sep).join("/");
      const url = rel.startsWith("public/")
        ? "/" + rel.slice("public/".length)
        : "/_next" + rel.slice(".next".length);
      console.log(JSON.stringify({ url, b64: fs.readFileSync(file).toString("base64") }));
    }
  `.trim();

  const { stdout } = await run(
    "docker",
    ["exec", containerId, "node", "-e", script],
    { maxBuffer: 64 * 1024 * 1024 }
  );

  const corpus = new Map<string, string>();

  // The home document is served public content too, and the URL probes below
  // are sent from its origin.
  corpus.set(
    "/",
    await fetch(`${baseUrl}/`).then((response) => response.text())
  );

  for (const entry of inventoryEntries(stdout)) {
    corpus.set(entry.url, Buffer.from(entry.b64, "base64").toString("utf8"));
  }

  return corpus;
}

/**
 * The corpus URLs whose file paths name a migration or carry a SQL spelling.
 * Derived from the inventory itself, so the probes stay honest about what the
 * image actually contains.
 */
export function sqlUrlsInCorpus(
  corpus: Map<string, string>
): readonly string[] {
  const tags = SQL_SOURCES.map(({ tag }) => tag);

  return [...corpus.keys()].filter(
    (url) =>
      url.endsWith(".sql") ||
      url.endsWith(".SQL") ||
      tags.some((tag) => url.includes(tag))
  );
}

/**
 * The corpus URLs whose served body contains migration SQL — verbatim,
 * newline-escaped, or base64-encoded — with the normalized repository SQL as
 * the needles. Returned per URL so a failure names the exact artifact.
 */
export function scanCorpusForMigrationSql(
  corpus: Map<string, string>
): readonly string[] {
  const offenders: string[] = [];

  for (const [url, body] of corpus) {
    // Candidate set one: the body verbatim, and the body with JavaScript
    // string-literal newline escapes resolved (SQL carried unquoted).
    const candidates = [body, body.replaceAll("\\n", "\n")];

    let hit = candidates.some((candidate) => {
      const normalized = normalizeSqlText(candidate);

      return SQL_SOURCES.some(({ normalized: needle }) =>
        normalized.includes(needle)
      );
    });

    // Candidate set two: JSON string literals in the body, decoded with
    // JSON.parse — never eval — so SQL carried as an escaped JavaScript or
    // JSON string (newlines, quotes, tabs) is seen in its true form.
    if (!hit) {
      const literals = body.match(/"(?:[^"\\\n]|\\.)*"/g) ?? [];

      // Budgets are calibrated above the largest observed production chunk
      // (2115 string literals measured in the current build); exceeding them
      // is an anomalous artifact and fails the proof with the URL named.
      if (literals.length > 25000) {
        throw new Error(
          `${url}: ${literals.length} string literals exceed the scanner's 25000-literal budget; the remainder would be silently unscanned, so the proof fails closed`
        );
      }

      hit = literals.some((literal) => {
        if (literal.length > 1048576) {
          throw new Error(
            `${url}: a ${literal.length}-character string literal exceeds the scanner's 1048576-character budget; the proof fails closed rather than skip it`
          );
        }

        let decoded: string;

        try {
          // SAFETY: the literal is one double-quoted JSON-shaped token taken
          // from the body; JSON.parse of a quoted token yields the decoded
          // string or throws, and the throw path is the skip below.
          decoded = JSON.parse(literal) as string;
        } catch {
          // Not a valid JSON string literal, so it carries no escaped form
          // to decode; the raw body was already scanned above.
          return false;
        }

        const normalized = normalizeSqlText(decoded);

        return SQL_SOURCES.some(({ normalized: needle }) =>
          normalized.includes(needle)
        );
      });
    }

    // Candidate set three: base64-shaped tokens (SQL carried as encoded
    // bytes).
    if (!hit) {
      const encoded = body.match(/[A-Za-z0-9+/=]{64,}/g) ?? [];

      if (encoded.length > 25000) {
        throw new Error(
          `${url}: ${encoded.length} base64-shaped tokens exceed the scanner's 25000-token budget; the remainder would be silently unscanned, so the proof fails closed`
        );
      }

      hit = encoded.some((token) => {
        const decoded = normalizeSqlText(
          Buffer.from(token, "base64").toString("utf8")
        );

        return SQL_SOURCES.some(({ normalized: needle }) =>
          decoded.includes(needle)
        );
      });
    }

    if (hit) offenders.push(url);
  }

  return offenders;
}
