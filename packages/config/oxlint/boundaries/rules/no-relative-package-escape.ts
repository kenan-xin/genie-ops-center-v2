import { dirname, resolve, sep } from "node:path";

import { defineRule } from "@oxlint/plugins";

/**
 * The module folder of a file, or null when the file is not inside one. The
 * path is the absolute file name oxlint reports, so the match is anchored on
 * the `packages/modules/<id>` segment rather than on a repository-relative
 * spelling that depends on the working directory.
 */
function moduleRootOf(filePath: string): string | null {
  const match = /^(.*[\\/]packages[\\/]modules[\\/][^\\/]+)[\\/]/.exec(
    filePath
  );

  return match?.[1] ?? null;
}

/** True when `candidate` is the directory itself or anything below it. */
function isInside(directory: string, candidate: string): boolean {
  return candidate === directory || candidate.startsWith(`${directory}${sep}`);
}

/**
 * A module never imports another module, and it reaches any other package by
 * package name. Both rules are about where a relative specifier lands, so this
 * rule resolves the specifier against the importing file and compares module
 * folders. A glob over the specifier string cannot do that: the number of `..`
 * segments that leaves a module depends on how deep the importing file sits,
 * which the string alone does not say.
 */
export const noRelativePackageEscapeRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow a relative import that leaves the importing module's own folder.",
    },
    messages: {
      siblingModule: "a module never imports another module.",
      leavesPackage:
        "a module reaches another package by its package name, never by a relative path.",
    },
  },
  createOnce(context) {
    function check(node: {
      readonly source: { readonly value: string };
    }): void {
      const specifier = node.source.value;

      if (!specifier.startsWith(".")) return;

      const own = moduleRootOf(context.filename);

      if (own === null) return;

      const target = resolve(dirname(context.filename), specifier);

      if (isInside(own, target)) return;

      const targetModule = moduleRootOf(`${target}${sep}`);

      context.report({
        // SAFETY: every visited node carries a source literal, which is the
        // node the diagnostic points at.
        node: node as never,
        messageId: targetModule === null ? "leavesPackage" : "siblingModule",
      });
    }

    return {
      ImportDeclaration: check,
      ExportAllDeclaration: check,
      ExportNamedDeclaration(node) {
        if (node.source !== null) check({ source: node.source });
      },
    };
  },
});
