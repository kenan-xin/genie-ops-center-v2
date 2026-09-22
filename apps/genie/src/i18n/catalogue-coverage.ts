import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";

/** One source file this check reads: the path to name in a message, and its text. */
export type SourceText = {
  readonly path: string;
  readonly text: string;
};

/** What one file contributes: the keys it references, and the problems it carries. */
export type SourceAnalysis = {
  readonly keys: readonly string[];
  readonly violations: readonly string[];
};

/** A catalogue value: a message, or a namespace that holds more of them. */
export type CatalogueNode =
  | string
  | { readonly [segment: string]: CatalogueNode };

const NEXT_INTL_MODULES = new Set(["next-intl", "next-intl/server"]);

/**
 * The two factories that produce a translator, as inventoried across
 * `apps/genie/src` on 2026-09-22: `getTranslations` in every server component,
 * and `useTranslations` in the catalogue test's probe component.
 *
 * A form outside this set is reported rather than guessed at. The check reads
 * one file at a time with no type checker, so a shape it was not built for must
 * fail the run and be added here deliberately.
 */
const TRANSLATOR_FACTORIES = new Set(["getTranslations", "useTranslations"]);

/**
 * The next-intl imports that produce no catalogue key, as inventoried on the
 * same date. Anything else imported from next-intl is unsupported: a new API
 * that reads messages would otherwise pass this check unexamined.
 */
const KEYLESS_IMPORTS = new Set([
  "NextIntlClientProvider",
  "getLocale",
  "getMessages",
  "getRequestConfig",
]);

/** `path:line` for one node, so every violation names where to look. */
function where(source: ts.SourceFile, node: ts.Node): string {
  const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));

  return `${source.fileName}:${line + 1}`;
}

/** Every node in the file, parents first. */
function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

/**
 * The sole argument of a call, when it is one plain string literal.
 *
 * A template literal, a variable, a spread, a second argument or no argument at
 * all returns `undefined`, which every caller turns into a violation. That is
 * what makes a dynamic namespace or key fail rather than disappear.
 */
function literalArgument(call: ts.CallExpression): string | undefined {
  const [only] = call.arguments;

  if (call.arguments.length !== 1 || only === undefined) return undefined;

  return ts.isStringLiteral(only) ? only.text : undefined;
}

/**
 * The local names bound to a next-intl translator factory, keyed by the local
 * name so an aliased import resolves to the factory it really names.
 *
 * Every other next-intl import is either inventoried as keyless or reported.
 * Type-only imports are skipped: they bind no value and can reference no key.
 */
function factoryBindings(
  source: ts.SourceFile,
  violations: string[]
): ReadonlyMap<string, string> {
  const bindings = new Map<string, string>();

  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;

    const specifier = statement.moduleSpecifier;

    if (
      !ts.isStringLiteral(specifier) ||
      !NEXT_INTL_MODULES.has(specifier.text)
    ) {
      continue;
    }

    const clause = statement.importClause;

    if (clause === undefined || clause.isTypeOnly) continue;

    if (clause.name !== undefined) {
      violations.push(
        `${where(source, clause.name)}: a default import from "${specifier.text}" is an unsupported shape. This check reads named imports only.`
      );
    }

    const named = clause.namedBindings;

    if (named === undefined) continue;

    if (!ts.isNamedImports(named)) {
      violations.push(
        `${where(source, named)}: a namespace import from "${specifier.text}" is an unsupported shape, because every key reached through it is invisible here.`
      );

      continue;
    }

    for (const element of named.elements) {
      if (element.isTypeOnly) continue;

      const imported = (element.propertyName ?? element.name).text;

      if (TRANSLATOR_FACTORIES.has(imported)) {
        bindings.set(element.name.text, imported);

        continue;
      }

      if (KEYLESS_IMPORTS.has(imported)) continue;

      violations.push(
        `${where(source, element)}: "${imported}" is imported from "${specifier.text}" and is not one of the inventoried forms. Extend this check before using it.`
      );
    }
  }

  return bindings;
}

/** A factory call, with any `await` in front of it removed. */
function factoryCall(
  initializer: ts.Expression,
  factories: ReadonlyMap<string, string>
): ts.CallExpression | undefined {
  const call = ts.isAwaitExpression(initializer)
    ? initializer.expression
    : initializer;

  if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) {
    return undefined;
  }

  return factories.has(call.expression.text) ? call : undefined;
}

/**
 * The translator names this file binds, each mapped to its namespace.
 *
 * `accounted` collects the factory calls that produced a binding, so the caller
 * can report a factory called in any other position.
 */
function translatorBindings(
  source: ts.SourceFile,
  factories: ReadonlyMap<string, string>,
  accounted: Set<ts.Node>,
  declared: Set<ts.Node>,
  violations: string[]
): ReadonlyMap<string, string> {
  const bindings = new Map<string, string>();

  walk(source, (node) => {
    if (!ts.isVariableDeclaration(node) || node.initializer === undefined) {
      return;
    }

    const call = factoryCall(node.initializer, factories);

    if (call === undefined) return;

    accounted.add(call);

    const namespace = literalArgument(call);

    if (namespace === undefined) {
      violations.push(
        `${where(source, call)}: the namespace is not one string literal, so no key under it can be checked.`
      );

      return;
    }

    if (!ts.isIdentifier(node.name)) {
      violations.push(
        `${where(source, node.name)}: a translator taken apart by a destructuring pattern is an unsupported shape.`
      );

      return;
    }

    const local = node.name.text;

    if (bindings.has(local)) {
      violations.push(
        `${where(source, node.name)}: "${local}" is bound to a translator twice in one file, so its namespace is ambiguous.`
      );

      return;
    }

    bindings.set(local, namespace);
    declared.add(node.name);
  });

  return bindings;
}

/** True when this identifier is the name a declaration introduces. */
function isDeclaredName(node: ts.Identifier): boolean {
  const parent = node.parent;

  return (
    (ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isBindingElement(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isImportSpecifier(parent)) &&
    parent.name === node
  );
}

/**
 * Every catalogue key one file references, and every problem that stops this
 * check from reading one.
 *
 * The analysis is binding-aware rather than textual: a key counts only when it
 * is a literal argument to an identifier that this file bound to a next-intl
 * factory, through the import specifier that really names that factory. A local
 * helper called `t` therefore contributes nothing, and an aliased import is
 * followed correctly.
 *
 * There is no type checker and no scope analysis, so a translator name that is
 * declared a second time anywhere in the file is reported rather than resolved.
 * The check fails loudly instead of reading the wrong namespace.
 */
export function analyseSource(path: string, text: string): SourceAnalysis {
  const source = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const violations: string[] = [];
  const factories = factoryBindings(source, violations);

  if (factories.size === 0) {
    return { keys: [], violations };
  }

  const accounted = new Set<ts.Node>();
  const declared = new Set<ts.Node>();

  const translators = translatorBindings(
    source,
    factories,
    accounted,
    declared,
    violations
  );

  const keys: string[] = [];

  walk(source, (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;

      if (factories.has(name) && !accounted.has(node)) {
        violations.push(
          `${where(source, node)}: "${name}" is called outside a variable declaration, so its translator has no name to follow.`
        );
      }
    }

    if (!ts.isIdentifier(node)) return;

    const namespace = translators.get(node.text);

    if (namespace === undefined) return;

    // The binding's own declaration site is the one place the name is not a use.
    if (declared.has(node)) return;

    const parent = node.parent;

    if (isDeclaredName(node)) {
      // Any other declaration of the same name is a rebinding this check cannot
      // resolve without scope analysis, so it is reported rather than guessed.
      violations.push(
        `${where(source, node)}: "${node.text}" names a translator and is declared again here, so the namespace it carries is no longer certain.`
      );

      return;
    }

    if (!ts.isCallExpression(parent) || parent.expression !== node) {
      violations.push(
        `${where(source, node)}: the translator "${node.text}" is used as a value rather than called with a literal key, so the keys it reaches are invisible here.`
      );

      return;
    }

    const key = literalArgument(parent);

    if (key === undefined) {
      violations.push(
        `${where(source, parent)}: the key is not one string literal, so it cannot be resolved against the catalogue.`
      );

      return;
    }

    keys.push(`${namespace}.${key}`);
  });

  return { keys, violations };
}

/**
 * The catalogue's fully qualified leaf keys, such as `app.title`.
 *
 * Comparing leaves rather than namespaces is what makes both directions
 * deterministic: a key a source references and the catalogue lacks, and a
 * catalogue entry no source references, are each one exact string difference.
 */
export function catalogueLeafKeys(catalogue: CatalogueNode): readonly string[] {
  const leaves: string[] = [];

  function descend(node: CatalogueNode, prefix: string): void {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the boundary read of catalogue JSON, whose leaves and namespaces are distinguished by nothing else
    if (typeof node === "string") {
      leaves.push(prefix);

      return;
    }

    for (const [segment, child] of Object.entries(node)) {
      descend(child, prefix === "" ? segment : `${prefix}.${segment}`);
    }
  }

  descend(catalogue, "");

  return leaves.toSorted();
}

/** A file this check reads: application source, never a test, story or fixture. */
function isProductionSource(name: string, path: string): boolean {
  if (!name.endsWith(".ts") && !name.endsWith(".tsx")) return false;

  if (/\.(?:test|stories)\.tsx?$/.test(name)) return false;

  return !path.includes("__fixtures__") && !path.includes("__testing__");
}

/** Every production source under `root`, with paths relative to it. */
export function productionSources(root: string): readonly SourceText[] {
  const sources: SourceText[] = [];

  for (const entry of readdirSync(root, {
    recursive: true,
    withFileTypes: true,
  })) {
    const absolute = join(entry.parentPath, entry.name);

    if (!entry.isFile() || !isProductionSource(entry.name, absolute)) continue;

    sources.push({
      path: relative(root, absolute),
      text: readFileSync(absolute, "utf8"),
    });
  }

  return sources.toSorted((left, right) => left.path.localeCompare(right.path));
}

/**
 * One sentence per problem. An empty array means every referenced key resolves
 * in the catalogue, every catalogue key is referenced, and no reference was
 * written in a shape this check cannot read.
 */
export function catalogueViolations(
  sources: readonly SourceText[],
  catalogue: CatalogueNode
): readonly string[] {
  const violations: string[] = [];
  const referenced = new Set<string>();

  for (const source of sources) {
    const analysis = analyseSource(source.path, source.text);

    violations.push(...analysis.violations);

    for (const key of analysis.keys) referenced.add(key);
  }

  const leaves = catalogueLeafKeys(catalogue);
  const known = new Set(leaves);

  for (const key of [...referenced].toSorted()) {
    if (!known.has(key)) {
      violations.push(
        `${key} is read from the catalogue and is not in it. Add the message or correct the key.`
      );
    }
  }

  for (const key of leaves) {
    if (!referenced.has(key)) {
      violations.push(
        `${key} is in the catalogue and no application source reads it. Delete the message or use it.`
      );
    }
  }

  return violations;
}
