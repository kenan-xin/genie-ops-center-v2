import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { storyNameFromExport, toId } from "storybook/internal/csf";
import { describe, expect, it } from "vitest";

import { KNOWN_CASE_STORIES } from "./known-case-stories.ts";

const WORKSPACE_ROOT = resolve(import.meta.dirname, "../../..");

/** Every story id in the repository, from each file's meta title and its story exports. */
function storyIds(): Set<string> {
  const ids = new Set<string>();

  for (const file of globSync("{apps,packages}/**/*.stories.{ts,tsx}", {
    cwd: WORKSPACE_ROOT,
    exclude: (path) => path.includes("node_modules"),
  })) {
    const source = readFileSync(resolve(WORKSPACE_ROOT, file), "utf8");

    const title =
      /(?:const meta\b[^=]*=|export default)\s*\{[\s\S]*?\btitle:\s*"([^"]+)"/.exec(
        source
      )?.[1];

    if (title === undefined) continue;

    for (const [, name] of source.matchAll(/^export const (\w+)/gm))
      if (name !== undefined) ids.add(toId(title, storyNameFromExport(name)));
  }

  return ids;
}

describe("the icon check's known-case stories", () => {
  // A renamed story leaves its old id here, and its known-case icons fall back under the allow
  // list, which can then hide them (P07-16).
  it("name only stories that exist", () => {
    const ids = storyIds();

    expect(KNOWN_CASE_STORIES.filter((id) => !ids.has(id))).toEqual([]);
  });
});
