#!/usr/bin/env node
// The genie-ops command, on PATH so `docker compose exec <service> genie-ops ...` reaches it
// without entrypoint.sh (R-62, D-10).
//
// It finds the single standalone server under /app the same way entrypoint.sh does, then loads
// the command entry the build traced beside it and hands over the arguments. The entry is the
// instrumentation module, which the server also loads: one bundle carries the application and
// the command, so both read the same traced migration SQL.
import { AsyncLocalStorage } from "node:async_hooks";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const APP_ROOT = "/app";

const MAX_DEPTH = 4;

function findServerFiles(dir, depth, found) {
  if (depth > MAX_DEPTH) return found;

  let entries;

  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    if (entry.name === "node_modules") continue;

    const child = join(dir, entry.name);

    if (entry.isDirectory()) findServerFiles(child, depth + 1, found);
    else if (entry.isFile() && entry.name === "server.js") found.push(child);
  }

  return found;
}

const servers = findServerFiles(APP_ROOT, 0, []);

if (servers.length !== 1) {
  process.stderr.write(
    `genie-ops: expected exactly one standalone server.js under ${APP_ROOT}, found ${servers.length}\n`
  );
  process.exit(70);
}

const root = dirname(servers[0]);

const entry = join(root, ".next", "server", "instrumentation.js");

process.env.NEXT_RUNTIME ??= "nodejs";

process.env.NODE_ENV ??= "production";

// The entry is a Next server entry, so loading it also loads Next's server environment, which
// patches `console` around the work async storage. Next's own baseline exposes
// `AsyncLocalStorage` on the global before those extensions load; a bare `node` process has no
// such global, so this stands in for that one line. Without it the first `console` call throws
// "AsyncLocalStorage accessed in runtime where it is not available".
globalThis.AsyncLocalStorage ??= AsyncLocalStorage;

let loaded;

try {
  loaded = await import(pathToFileURL(entry).href);
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);

  process.stderr.write(
    `genie-ops: could not load the command entry at ${entry}: ${detail}\n`
  );
  process.exit(70);
}

const exported = loaded["module.exports"] ?? loaded.default;

const runOps = exported?.runOps;

// oxlint-disable-next-line anti-slop/no-runtime-typeof -- the loaded module is untrusted input
if (typeof runOps !== "function") {
  process.stderr.write(
    "genie-ops: the image carries no genie-ops command entry\n"
  );
  process.exit(70);
}

const code = await runOps(process.argv.slice(2));

// oxlint-disable-next-line anti-slop/no-runtime-typeof -- the command's return is untrusted input
process.exit(typeof code === "number" && Number.isInteger(code) ? code : 1);
