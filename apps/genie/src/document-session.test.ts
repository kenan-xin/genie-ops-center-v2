import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * genie-ops-center-v2-pt9d and genie-ops-center-v2-zzjg. The root layout and the page render in
 * parallel, so a server component that makes its own enforced session read can decide
 * differently from the layout at the idle boundary. Every server-rendered read goes through
 * `documentSessionState`, which React shares across one request.
 *
 * The check reads the syntax tree of every source file, so a read is found however it is
 * written: a member call, a destructured or aliased member, a string index, or an aliased import
 * of a helper that reads. It scans the app, core, every module, and every customer app.
 *
 * What it cannot see: a read reached through a value whose name it does not know, such as a
 * function stored in a map and called later. It also does not tell a server component from
 * client code; no client code may call these names anyway.
 */
const ROOT = join(import.meta.dirname, "../../..");

/** Where server code lives; tests, stories and fixtures are not shipped. */
const SOURCES = [
  "apps/*/src/**/*.{ts,tsx}",
  "packages/*/src/**/*.{ts,tsx}",
  "packages/modules/*/src/**/*.{ts,tsx}",
  "customers/*/app/**/*.{ts,tsx}",
];

/**
 * The names that run the enforced read (R-14): the auth member's reads and the two app helpers
 * built on them. `listOwnSessions` is absent: it takes a session that was already read.
 */
const ENFORCED_READS = new Set([
  "getSession",
  "sessionState",
  "recordActivity",
  "revokeOwnSession",
  "revokeOtherOwnSessions",
  "endIdleSession",
  "requestPrincipal",
  "refuseLimitedSession",
]);

/** The files allowed to read directly: the seams that own the reads, and core's auth service. */
const OWNERS = new Set([
  "apps/genie/src/document-session.ts",
  "apps/genie/src/request-principal.ts",
  "apps/genie/src/limited-session.ts",
]);

/**
 * A Next route handler: a `route.ts` inside the `app/` router directory of the standard app or a
 * customer app. A handler is one request with no parallel render, so its reads run in order. A
 * file named `route.ts` anywhere else, a helper in a package for instance, is not exempt.
 */
const ROUTE_HANDLER =
  /^(?:apps\/[^/]+\/src|customers\/[^/]+\/app(?:\/src)?)\/app\/(?:.+\/)?route\.ts$/;

function mayReadDirectly(path: string): boolean {
  return (
    OWNERS.has(path) ||
    path.startsWith("packages/core/src/services/auth/") ||
    ROUTE_HANDLER.test(path)
  );
}

function serverSources(): string[] {
  return globSync(SOURCES, { cwd: ROOT })
    .map((path) => path.split("\\").join("/"))
    .filter((path) => !/\.(?:test|stories)\.tsx?$/.test(path))
    .filter((path) => !path.includes("/__fixtures__/"))
    .filter((path) => !mayReadDirectly(path));
}

/** Every place a source names an enforced read, as `line:name`. */
function enforcedReadsIn(fileName: string, text: string): string[] {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const found: string[] = [];

  function note(node: ts.Node, name: string): void {
    if (!ENFORCED_READS.has(name)) return;

    const { line } = source.getLineAndCharacterOfPosition(node.getStart());

    found.push(`${line + 1}:${name}`);
  }

  function visit(node: ts.Node): void {
    if (ts.isPropertyAccessExpression(node)) note(node.name, node.name.text);
    else if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteralLike(node.argumentExpression)
    )
      note(node.argumentExpression, node.argumentExpression.text);
    else if (
      ts.isBindingElement(node) &&
      ts.isObjectBindingPattern(node.parent)
    ) {
      const key = node.propertyName ?? node.name;

      if (ts.isIdentifier(key) || ts.isStringLiteral(key)) note(key, key.text);
    } else if (ts.isImportSpecifier(node))
      note(node, (node.propertyName ?? node.name).text);

    ts.forEachChild(node, visit);
  }

  visit(source);

  return found;
}

describe("the document session read", () => {
  it("is the only enforced session read outside a route handler", () => {
    const sources = serverSources();

    // The scan must reach every tree it names, or a green run proves nothing.
    expect(sources).toContain("apps/genie/src/app/layout.tsx");
    expect(sources.some((path) => path.startsWith("packages/core/src/"))).toBe(
      true
    );
    expect(sources.some((path) => path.startsWith("packages/modules/"))).toBe(
      true
    );

    const offenders = sources.flatMap((path) =>
      enforcedReadsIn(path, readFileSync(join(ROOT, path), "utf8")).map(
        (place) => `${path}:${place}`
      )
    );

    expect(offenders).toEqual([]);
  });

  it.each([
    ["a member call", "await auth.sessionState({ headers });"],
    [
      "the read before pt9d",
      "await requireAuth(app.tenant).getSession({ headers });",
    ],
    ["an activity write", "await auth.recordActivity({ headers });"],
    ["a revoke", "await auth.revokeOwnSession({ headers, sessionId });"],
    [
      "a sign out everywhere",
      "await auth.revokeOtherOwnSessions({ headers });",
    ],
    [
      "a destructured alias",
      "const { sessionState: read } = auth; await read({ headers });",
    ],
    ["a string index", 'await auth["getSession"]({ headers });'],
    [
      "an aliased helper import",
      'import { requestPrincipal as principal } from "../request-principal.ts";',
    ],
    [
      "the limited-session helper",
      'import { refuseLimitedSession } from "../limited-session.ts";',
    ],
    [
      "a namespace import",
      "await limited.refuseLimitedSession(auth, headers);",
    ],
  ])("finds %s", (_, text) => {
    expect(enforcedReadsIn("page.tsx", text)).not.toEqual([]);
  });

  it.each([
    ["apps/genie/src/app/api/session/activity/route.ts", true],
    ["apps/genie/src/app/route.ts", true],
    ["customers/acme/app/src/app/api/x/route.ts", true],
    ["packages/core/src/features/account/route.ts", false],
    ["packages/modules/placeholder/src/route.ts", false],
    ["apps/genie/src/route.ts", false],
  ])("exempts %s as a route handler: %s", (path, exempt) => {
    expect(mayReadDirectly(path)).toBe(exempt);
  });

  it("lets the shared read and a session list through", () => {
    const text = [
      'import { documentSessionState } from "../document-session.ts";',
      "const state = await documentSessionState();",
      "await auth.listOwnSessions({ session: state.session });",
    ].join("\n");

    expect(enforcedReadsIn("page.tsx", text)).toEqual([]);
  });
});
