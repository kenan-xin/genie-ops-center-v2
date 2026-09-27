import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

import ts from "typescript";

/**
 * A static, TSX-capable import-graph probe for a browser feature entrypoint.
 *
 * The runtime build-safety probe imports an entry in Node, which cannot load `.tsx` at all. A
 * browser feature entry is `.ts` but reaches `.tsx`, so it is checked here instead: the whole
 * graph reachable from the entry is parsed with the TypeScript compiler, and the probe fails on
 * anything that would put a database driver, a connection-capable builtin, the core runtime, or a
 * deployment environment read into a browser bundle. It resolves imports statically and starts
 * nothing.
 *
 * A relative import is followed, and an `@genie/*` workspace package is followed into its source
 * through its `package.json` `exports`, so a driver or an environment read reached through a
 * workspace dependency is caught too. A third-party package is a leaf: its own specifier is
 * checked against the banned names, but its internals are not walked.
 */
export type FeatureGraphReport = {
  /** Every module reached, absolute, the entry first. */
  readonly files: readonly string[];
  /** One line per forbidden reach, or an unresolved relative import that breaks the walk. */
  readonly violations: readonly string[];
};

/**
 * Resolves one `@genie/*` specifier to the source file its package `exports` names, from the file
 * that imported it, or `undefined` when it does not resolve. Overridable so the probe's follow
 * behaviour can be tested without installing a fixture workspace package.
 */
export type WorkspaceResolver = (
  specifier: string,
  fromFile: string
) => string | undefined;

/**
 * The real resolver: Node resolution from the importing file, which honours a workspace package's
 * `exports` map through the `node_modules` symlink, so the walk enters its source and not a build
 * output.
 */
const defaultResolveWorkspace: WorkspaceResolver = (specifier, fromFile) => {
  try {
    return createRequire(fromFile).resolve(specifier);
  } catch {
    return undefined;
  }
};

/** Bare specifiers that must never be reachable from a browser feature entry. */
const FORBIDDEN_BARE = new Map<string, string>([
  ["pg", "the Postgres driver"],
  ["drizzle-orm/node-postgres", "the node-postgres adapter"],
  ["node:net", "a connection builtin"],
  ["node:dns", "a connection builtin"],
  ["node:dns/promises", "a connection builtin"],
  ["node:http", "a connection builtin"],
  ["node:https", "a connection builtin"],
  ["node:tls", "a connection builtin"],
  ["node:dgram", "a connection builtin"],
  ["node:child_process", "a process and connection builtin"],
  ["node:worker_threads", "a process and connection builtin"],
]);

/** The module specifiers one file imports, from static imports, re-exports and dynamic imports. */
function specifiers(sourceFile: ts.SourceFile): readonly string[] {
  const found: string[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      !node.importClause?.isTypeOnly &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push(node.moduleSpecifier.text);
    }

    if (
      ts.isExportDeclaration(node) &&
      node.isTypeOnly !== true &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push(node.moduleSpecifier.text);
    }

    // A dynamic `import("x")` or `require("x")` reaches a runtime module too.
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require"))
    ) {
      const [argument] = node.arguments;

      if (argument !== undefined && ts.isStringLiteral(argument)) {
        found.push(argument.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return found;
}

/** True when the file reads `process.env`, by property or by index. */
function readsEnvironment(sourceFile: ts.SourceFile): boolean {
  let reads = false;

  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "process" &&
      node.name.text === "env"
    ) {
      reads = true;
    } else if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "process" &&
      node.argumentExpression !== undefined &&
      ts.isStringLiteral(node.argumentExpression) &&
      node.argumentExpression.text === "env"
    ) {
      reads = true;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return reads;
}

/** The on-disk path a relative specifier resolves to, trying the `.ts`/`.tsx` forms in order. */
function resolveRelative(
  fromFile: string,
  specifier: string
): string | undefined {
  const base = resolve(dirname(fromFile), specifier);

  const candidates =
    base.endsWith(".ts") || base.endsWith(".tsx")
      ? [base]
      : [
          `${base}.ts`,
          `${base}.tsx`,
          resolve(base, "index.ts"),
          resolve(base, "index.tsx"),
        ];

  return candidates.find((candidate) => existsSync(candidate));
}

/** The whole graph reachable from `entryPath`, and every forbidden reach it holds. */
export function analyzeFeatureGraph(
  entryPath: string,
  resolveWorkspace: WorkspaceResolver = defaultResolveWorkspace
): FeatureGraphReport {
  const files: string[] = [];
  const violations: string[] = [];
  const visited = new Set<string>();
  const queue = [entryPath];

  while (queue.length > 0) {
    const file = queue.pop();

    if (file === undefined || visited.has(file)) continue;

    visited.add(file);
    files.push(file);

    const source = readFileSync(file, "utf8");

    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    if (readsEnvironment(sourceFile)) {
      violations.push(`${file} reads process.env`);
    }

    for (const specifier of specifiers(sourceFile)) {
      const forbidden = FORBIDDEN_BARE.get(specifier);

      if (forbidden !== undefined) {
        violations.push(`${file} imports ${specifier} (${forbidden})`);
        continue;
      }

      if (specifier === "@genie/core" || specifier.startsWith("@genie/core/")) {
        violations.push(`${file} imports the core runtime (${specifier})`);
        continue;
      }

      if (specifier.startsWith(".")) {
        const next = resolveRelative(file, specifier);

        if (next === undefined) {
          violations.push(
            `${file} imports an unresolved relative path (${specifier})`
          );
          continue;
        }

        queue.push(next);
        continue;
      }

      // A workspace package is followed into its source, so a driver or an environment read it
      // reaches cannot hide behind the package boundary.
      if (specifier.startsWith("@genie/")) {
        const next = resolveWorkspace(specifier, file);

        if (next === undefined) {
          violations.push(
            `${file} imports a workspace package that does not resolve (${specifier})`
          );
          continue;
        }

        queue.push(next);
      }

      // Any other bare specifier is a third-party leaf: its own name was checked above, and its
      // internals stay out of the graph.
    }
  }

  return { files, violations };
}
