import { dirname, resolve, sep } from "node:path";

import { defineRule } from "@oxlint/plugins";
import type { ESTree, Scope, SourceCode } from "@oxlint/plugins";

/** The three declarations that can carry a module specifier. */
type DeclarationWithSource =
  | ESTree.ImportDeclaration
  | ESTree.ExportAllDeclaration
  | ESTree.ExportNamedDeclaration;

/** The values an ESTree literal node can carry. */
type LiteralValue =
  | ESTree.StringLiteral["value"]
  | ESTree.NumericLiteral["value"]
  | ESTree.BooleanLiteral["value"]
  | ESTree.NullLiteral["value"]
  | ESTree.BigIntLiteral["value"]
  | ESTree.RegExpLiteral["value"];

/**
 * True for a primitive string. A literal's value is already parsed AST, not
 * untrusted input, which is the type-guard case the anti-slop
 * `no-runtime-typeof` rule documents. Its `allowInTypeGuards` option is off
 * repository-wide, so this one guard carries a local suppression instead of a
 * configuration change.
 */
function isStringValue(value: LiteralValue): value is string {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a parsed AST literal, not untrusted I/O
  return typeof value === "string";
}

/**
 * The module folder of a file, or null when the file is not inside one. The
 * path is the absolute file name oxlint reports, so the match is anchored on
 * the `packages/modules/<id>` segment rather than on a repository-relative
 * spelling that depends on the working directory.
 *
 * The prefix is lazy on purpose. A module may hold a folder of its own named
 * `packages/modules/<something>`, for a fixture or a template, and a greedy
 * prefix would take that nested folder for the package root. The workspace
 * package root is the outermost such segment, which is the first one.
 */
function moduleRootOf(filePath: string): string | null {
  const match = /^(.*?[\\/]packages[\\/]modules[\\/][^\\/]+)[\\/]/.exec(
    filePath
  );

  return match?.[1] ?? null;
}

/**
 * True when the identifier resolves to a binding in some enclosing scope. A
 * loader `require` resolves to nothing, in a module file as well as a script,
 * so a resolved binding marks an ordinary local function of that name.
 */
function isDeclaredLocally(
  sourceCode: SourceCode,
  identifier: ESTree.IdentifierReference
): boolean {
  let scope: Scope | null = sourceCode.getScope(identifier);

  while (scope !== null) {
    if (scope.set.has(identifier.name)) return true;

    scope = scope.upper;
  }

  return false;
}

/**
 * One module never imports another (Spec 0 R-7, module row), in every
 * spelling, relative imports included. A glob over the specifier cannot decide
 * this: oxlint matches the raw string, and how many `..` segments leave a
 * module depends on how deep the importing file sits. This rule resolves the
 * specifier against the importing file and compares module folders, so it has
 * no depth ceiling.
 *
 * It bans nothing else. A module may import core and ui, so a relative climb
 * to either is not this rule's business; R-7 lists the banned targets, and
 * neither is on that list. The other banned targets of the module row, `apps/*`
 * and `customers/*`, carry their folder name in the specifier, so the globs in
 * `packages/config/src/oxlint/boundaries.ts` catch them in every spelling.
 */
export const noRelativePackageEscapeRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow a relative import that reaches from one module into another.",
    },
    messages: {
      siblingModule: "a module never imports another module.",
    },
  },
  createOnce(context) {
    function report(node: ESTree.Node, value: LiteralValue): void {
      if (!isStringValue(value)) return;

      if (!value.startsWith(".")) return;

      const own = moduleRootOf(context.filename);

      if (own === null) return;

      const target = resolve(dirname(context.filename), value);

      if (target === own || target.startsWith(`${own}${sep}`)) return;

      // A trailing separator lets a target that is a module root itself, such
      // as `../beta`, match the same pattern as a file inside one.
      if (moduleRootOf(`${target}${sep}`) === null) return;

      context.report({ node, messageId: "siblingModule" });
    }

    // A declaration's `source` is null on a re-export of local names, and the
    // node itself is reported, because the plugin runtime needs a real node.
    function check(node: DeclarationWithSource): void {
      if (node.source !== null) report(node, node.source.value);
    }

    return {
      ImportDeclaration: check,
      ExportAllDeclaration: check,
      ExportNamedDeclaration: check,
      // `require` is executable source too, whatever the module format of the
      // file. A local declaration of that name is not a loader, so a resolved
      // binding means the call is an ordinary function call and is left alone.
      CallExpression(node) {
        const callee = node.callee;

        if (callee.type !== "Identifier" || callee.name !== "require") return;

        if (isDeclaredLocally(context.sourceCode, callee)) return;

        const [argument] = node.arguments;

        if (argument?.type === "Literal") report(node, argument.value);
      },
      // A dynamic import is executable source too (Spec 0 R-7, the paragraph
      // after R-7a). Only a literal specifier can be judged here; a computed
      // one is not decidable without running the program.
      ImportExpression(node) {
        if (node.source.type === "Literal") report(node, node.source.value);
      },
    };
  },
});
