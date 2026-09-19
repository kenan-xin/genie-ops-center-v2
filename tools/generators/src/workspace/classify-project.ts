/** The one architectural classification every project carries (Spec 0 R-4). */
export type ArchitecturalTag = "app" | "core" | "ui" | "module" | "config" | "tooling";

const EXACT_ROOTS = new Map<string, ArchitecturalTag>([
  ["packages/core", "core"],
  ["packages/ui", "ui"],
  ["packages/config", "config"],
  ["tools/generators", "tooling"],
]);

const PATTERNS: readonly (readonly [RegExp, ArchitecturalTag])[] = [
  [/^apps\/[^/]+$/, "app"],
  [/^customers\/[^/]+\/app$/, "app"],
  [/^packages\/modules\/[^/]+$/, "module"],
];

/**
 * Maps a repository-relative project root to its one architectural classification.
 * Throws when the root matches no rule, so an untagged folder cannot enter the graph.
 */
export function classifyProject(projectRoot: string): ArchitecturalTag {
  const root = projectRoot.replace(/\/+$/, "");

  const exact = EXACT_ROOTS.get(root);

  if (exact !== undefined) {
    return exact;
  }

  for (const [pattern, tag] of PATTERNS) {
    if (pattern.test(root)) {
      return tag;
    }
  }

  throw new Error(
    `"${root}" has no architectural classification. Add one rule in classify-project.ts.`,
  );
}
