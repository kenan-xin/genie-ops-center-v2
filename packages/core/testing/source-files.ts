import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The repository root, resolved from this file's own location. */
export const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

/** The three source roots that a runtime-access boundary scan reads. */
export const sourceRoots = [
  join(repositoryRoot, "packages/core/src"),
  join(repositoryRoot, "packages/modules"),
  join(repositoryRoot, "apps/genie/src"),
];

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx"]);

export function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);

    if (entry.isDirectory()) return sourceFiles(path);

    if (!sourceExtensions.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      return [];
    }

    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) return [];

    return [path];
  });
}
