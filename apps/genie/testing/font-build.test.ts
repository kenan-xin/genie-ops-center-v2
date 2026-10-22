import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import postcss from "postcss";
import { beforeAll, describe, expect, it } from "vitest";

import { assertBuildIsCurrent } from "./build-freshness.ts";

/**
 * Spec 3 AC-1 for fonts, against the real production build: the image ships the two
 * self-hosted faces and no other font file, and no stylesheet names a third-party URL.
 *
 * This file reads `.next` from disk and starts nothing, like `devtools-exclusion.test.ts`.
 */
const BUILD_ROOT = resolve(import.meta.dirname, "../.next");

const FONT_FILE = /\.(?:woff2?|ttf|otf|eot)$/i;

function filesUnder(tree: string, pattern: RegExp): string[] {
  return readdirSync(join(BUILD_ROOT, tree), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name));
}

function stylesheets() {
  // Turbopack writes stylesheets beside the scripts in static/chunks, so read every one.
  return filesUnder("static", /\.css$/).map((path) =>
    postcss.parse(readFileSync(path, "utf8"))
  );
}

function fontFiles(): string[] {
  return filesUnder("static/media", FONT_FILE);
}

function fontFaceFamilies(): string[] {
  const families: string[] = [];

  for (const sheet of stylesheets()) {
    sheet.walkAtRules("font-face", (rule) => {
      rule.walkDecls("font-family", (decl) => {
        families.push(decl.value.replaceAll(/["']/g, ""));
      });
    });
  }

  return families.toSorted();
}

function stylesheetUrls(): string[] {
  const urls: string[] = [];

  for (const sheet of stylesheets()) {
    sheet.walkDecls((decl) => {
      for (const match of decl.value.matchAll(/url\(\s*["']?([^"')]+)/g)) {
        if (match[1] !== undefined) urls.push(match[1]);
      }
    });
  }

  return urls;
}

beforeAll(() => {
  assertBuildIsCurrent(join(BUILD_ROOT, "BUILD_ID"));
});

describe("the production build and the fonts", () => {
  it("reads a real build, so an empty scan cannot pass", () => {
    expect(stylesheets().length).toBeGreaterThan(0);
  });

  it("ships the latin and latin-ext files of the default face and the mono face, and no other font file", () => {
    expect(fontFiles()).toHaveLength(4);
    expect(fontFiles().every((name) => name.endsWith(".woff2"))).toBe(true);
    expect(fontFaceFamilies()).toEqual([
      "JetBrains Mono",
      "JetBrains Mono",
      "Plus Jakarta Sans",
      "Plus Jakarta Sans",
    ]);
  });

  it("points every stylesheet url at a file inside the image", () => {
    expect(
      stylesheetUrls().filter((url) => /^(?:https?:)?\/\//i.test(url))
    ).toEqual([]);
  });
});
