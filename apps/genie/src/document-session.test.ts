import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * genie-ops-center-v2-pt9d. The enforced session read deletes an idle row, and the root layout
 * and the page render in parallel, so a server component that makes its own read races the
 * layout's: the loser reads anonymous, and a losing layout renders the document instead of
 * redirecting to the session-expired route. Every server-rendered read goes through
 * `documentSessionState`, which React shares across one request; only route handlers, which make
 * one read per request, call the auth member's reads directly.
 */
const SOURCE = import.meta.dirname;

/** The two seams that own the direct reads, and the route-handler helper that makes one. */
const OWNERS = new Set([
  "document-session.ts",
  "request-principal.ts",
  "limited-session.ts",
]);

const DIRECT_READ = /\.(?:sessionState|getSession)\(|\brequestPrincipal\(/;

function serverSources(): string[] {
  return readdirSync(SOURCE, { recursive: true, encoding: "utf8" })
    .filter((path) => /\.tsx?$/.test(path))
    .filter((path) => !/\.test\.tsx?$/.test(path))
    .filter((path) => basename(path) !== "route.ts")
    .filter((path) => !OWNERS.has(path));
}

describe("the document session read", () => {
  it("is the only enforced session read a server component makes", () => {
    const offenders = serverSources().filter((path) =>
      DIRECT_READ.test(readFileSync(join(SOURCE, path), "utf8"))
    );

    expect(offenders).toEqual([]);
  });
});
