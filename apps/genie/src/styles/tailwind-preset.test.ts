/**
 * The proof `genie-ops-center-v2-3yv` asks for: the shared preset is consumed by
 * a real compile, not asserted as an object shape.
 *
 * A shape test passes even when the consumer stops reading the preset, which is
 * exactly the regression the bead describes: a future Tailwind pin that dropped
 * JavaScript preset support would keep every existing test green while the
 * preset silently stopped being read.
 *
 * The preset is reached through the application's own Tailwind configuration,
 * never by importing `@genie/config` here. Product source must not import the
 * shared configuration package (R-7a); only a package configuration file
 * consumes a preset. Reading it through the consumer is also the better
 * assertion, because it proves the application's own wiring.
 *
 * API confirmed against the installed tailwindcss 4.3.3 types, dist/lib.d.mts:
 *   compile(css, opts) => Promise<{ sources: { base, pattern, negated }[], ... }>
 *   loadModule?: (id, base, resourceHint) => Promise<{ path, base, module }>
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compile, type Config } from "tailwindcss";
import { describe, expect, it } from "vitest";

import appTailwindConfig from "../../tailwind.config.ts";

const here = dirname(fileURLToPath(import.meta.url));

const requireFrom = createRequire(import.meta.url);

/** Widened, so the optional fields can be read without a cast. */
const appConfig: Config = appTailwindConfig;

function presetContent(): readonly string[] {
  const preset = appConfig.presets?.[0];

  // SAFETY: the application configuration declares exactly one preset, the
  // shared one, and the preset declares its content globs as a string array.
  // The two assertions in the test below fail first if either stops holding.
  return (preset?.content ?? []) as readonly string[];
}

async function compileApplicationStylesheet() {
  const css = await readFile(resolve(here, "globals.css"), "utf8");

  return compile(css, {
    // The stylesheet's own directory, so its relative `@config` resolves the way
    // it does in a real build rather than from the project root.
    base: here,

    // `@import "tailwindcss"` pulls the framework's own stylesheets, so the
    // compiler needs a resolver for both package specifiers and relative paths.
    loadStylesheet: async (id, base) => {
      const path = id.startsWith(".")
        ? resolve(base, id)
        : requireFrom.resolve(id.endsWith(".css") ? id : `${id}/index.css`);

      return {
        path,
        base: dirname(path),
        content: await readFile(path, "utf8"),
      };
    },

    loadModule: async (id, base) => {
      const path = resolve(base, id);

      // SAFETY: the compiler only asks for the module named by `@config`, and a
      // JavaScript configuration module either has a default export or is the
      // configuration object itself. Both shapes are read below.
      const loaded = (await import(path)) as { default?: unknown };

      // SAFETY: the only module this stylesheet loads is the application's own
      // Tailwind configuration, whose default export is a Config. A different
      // module would fail the compile rather than reach an assertion.
      const module = (loaded.default ?? loaded) as never;

      return { path, base: dirname(path), module };
    },
  });
}

describe("the application stylesheet", () => {
  it("does not duplicate the preset's content, or the proof below is vacuous", () => {
    // Guard on this test's own validity. If the consumer declared the same glob
    // the preset declares, the compiler would list it from both sides, and
    // removing the preset would no longer change the result.
    expect(appConfig.content).toEqual([
      "../../packages/core/src/features/**/*.{ts,tsx}",
    ]);
    expect(appConfig.presets).toHaveLength(1);
  });

  it("loads the shared preset through the real compiler", async () => {
    const compiled = await compileApplicationStylesheet();
    const patterns = compiled.sources.map((source) => source.pattern);
    const declared = presetContent();

    expect(declared.length).toBeGreaterThan(0);
    // Non-empty, because an empty source list would satisfy `arrayContaining`.
    expect(compiled.sources.length).toBeGreaterThan(0);
    expect(patterns).toEqual(expect.arrayContaining([...declared]));
  });

  it("produces utilities, so the compile itself is real", async () => {
    const compiled = await compileApplicationStylesheet();
    const output = compiled.build(["flex"]);

    // Without this, a compile that silently produced nothing would still let the
    // source assertion above pass.
    expect(output).toContain("display: flex");
  });
});
