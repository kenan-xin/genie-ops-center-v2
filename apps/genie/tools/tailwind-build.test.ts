/**
 * The CSS build proof of R-19c and AC-3: a class reaches the stylesheet only
 * from the shared UI, core, the app, or a selected module.
 *
 * The source-list test beside this one reads the compiler's scan list. This one
 * runs the scan: the real `globals.css`, the real `generateRegistry` and the
 * same `@tailwindcss/postcss` plugin that `postcss.config.mjs` hands the Next
 * build, over a staged root whose only classes are one probe per location. A
 * full `next build` would prove the same seam at many times the cost.
 */
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import tailwindcss from "@tailwindcss/postcss";
import postcss from "postcss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { generateRegistry } from "./generate-registry.ts";

const STYLES = resolve(import.meta.dirname, "../src/styles");

const STYLESHEET = "apps/genie/src/styles/globals.css";

// One utility per location. No other file in the staged root names a class.
const probes = {
  "packages/ui/src/probe.tsx": "columns-3",
  "packages/core/src/probe.tsx": "columns-4",
  "apps/genie/src/probe.tsx": "columns-5",
  "packages/modules/alpha/src/probe.tsx": "columns-6",
  "packages/modules/beta/src/probe.tsx": "columns-7",
} as const;

let root: string;

let css: string;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "genie-tailwind-"));

  cpSync(STYLES, dirname(join(root, STYLESHEET)), { recursive: true });

  // `@import "tailwindcss"` resolves from the stylesheet upwards.
  mkdirSync(join(root, "node_modules"));
  symlinkSync(
    dirname(createRequire(import.meta.url).resolve("tailwindcss/package.json")),
    join(root, "node_modules/tailwindcss")
  );
  // `@import "@genie/ui/fonts.css"` resolves the same way, to the real package.
  mkdirSync(join(root, "node_modules/@genie"));
  symlinkSync(
    resolve(import.meta.dirname, "../../../packages/ui"),
    join(root, "node_modules/@genie/ui")
  );

  for (const id of ["alpha", "beta"]) {
    const packageRoot = join(root, "packages/modules", id);

    mkdirSync(join(packageRoot, "src"), { recursive: true });
    writeFileSync(
      join(packageRoot, "package.json"),
      `${JSON.stringify({
        name: `@genie/module-${id}`,
        genie: { module: { id, entrypoint: "src/index.ts" } },
      })}\n`,
      "utf8"
    );
    writeFileSync(join(packageRoot, "src/index.ts"), "export {};\n", "utf8");
  }

  for (const [file, utility] of Object.entries(probes)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(
      join(root, file),
      `export const probe = "${utility}";\n`,
      "utf8"
    );
  }

  generateRegistry(root, "alpha");

  const from = join(root, STYLESHEET);

  css = (
    await postcss([tailwindcss()]).process(readFileSync(from, "utf8"), { from })
  ).css;
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const ruleFor = (utility: string) => new RegExp(`\\.${utility}\\s*\\{`);

describe("the built application stylesheet", () => {
  it.each([
    ["the shared UI", probes["packages/ui/src/probe.tsx"]],
    ["core", probes["packages/core/src/probe.tsx"]],
    ["the app", probes["apps/genie/src/probe.tsx"]],
    ["a selected module", probes["packages/modules/alpha/src/probe.tsx"]],
  ])("holds a class used only in %s", (_, utility) => {
    expect(css).toMatch(ruleFor(utility));
  });

  it("holds no class used only in an excluded module", () => {
    expect(css).not.toMatch(
      ruleFor(probes["packages/modules/beta/src/probe.tsx"])
    );
  });
});
