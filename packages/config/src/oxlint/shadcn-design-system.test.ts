import { describe, expect, it } from "vitest";

import { lintAt } from "./__testing__/lint-at.ts";
import { sharedOxlintConfig } from "./index.ts";

const LINT_TIMEOUT = 120_000;

const DISCLOSURE = `import { Disclosure } from "@genie/ui";\n`;

describe.concurrent(
  "the @shadcn/lint design-system rules run through the shared lint target",
  { timeout: LINT_TIMEOUT },
  () => {
    it("registers the plugin and points it at the design-system package", () => {
      const plugins = sharedOxlintConfig.jsPlugins ?? [];

      expect(plugins).toContainEqual({
        name: "shadcn",
        specifier: "@shadcn/lint",
      });

      expect(sharedOxlintConfig.settings?.shadcn).toEqual({
        ui: "@genie/ui",
      });
    });

    it("rejects a restyle of a design-system component", async () => {
      const result = await lintAt(
        "packages/ui/src/__shadcn__/__shadcn__.tsx",
        `${DISCLOSURE}export const a = <Disclosure summary="x" className="p-4" />;\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toMatch(/no-restyle/);
    });

    it("rejects a raw Tailwind palette color", async () => {
      const result = await lintAt(
        "packages/ui/src/__shadcn__/__shadcn__.tsx",
        `export const a = <div className="bg-pink-500" />;\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toMatch(/no-raw-colors/);
    });

    it("rejects an arbitrary off-scale value", async () => {
      const result = await lintAt(
        "packages/ui/src/__shadcn__/__shadcn__.tsx",
        `export const a = <div className="p-[13px]" />;\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toMatch(/no-arbitrary-values/);
    });

    it("rejects an inline style", async () => {
      const result = await lintAt(
        "packages/ui/src/__shadcn__/__shadcn__.tsx",
        `export const a = <div style={{ color: "red" }} />;\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toMatch(/no-inline-styles/);
    });

    it("rejects a class this project's Tailwind cannot generate", async () => {
      const result = await lintAt(
        "packages/ui/src/__shadcn__/__shadcn__.tsx",
        `export const a = <div className="rounded-huge" />;\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toMatch(/no-unknown-classes/);
    });

    it("rejects a class the linter cannot read", async () => {
      const result = await lintAt(
        "packages/ui/src/__shadcn__/__shadcn__.tsx",
        `${DISCLOSURE}export const a = <Disclosure summary="x" className={\`bg-\${"red"}\`} />;\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toMatch(/require-static-classes/);
    });

    it("pins the one accepted exception to one file and one rule", () => {
      const exceptions = (sharedOxlintConfig.overrides ?? []).filter(
        (entry) =>
          entry.rules?.["shadcn/no-inline-styles"] === "off" &&
          entry.files?.includes("packages/ui/src/theme/theme-provider.tsx")
      );

      expect(exceptions).toHaveLength(1);

      expect(exceptions[0]?.files).toEqual([
        "packages/ui/src/theme/theme-provider.tsx",
      ]);
    });

    it("applies the rules under an app source path as well", async () => {
      const result = await lintAt(
        "apps/genie/src/__shadcn__/__shadcn__.tsx",
        `export const a = <div className="bg-pink-500" />;\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toMatch(/no-raw-colors/);
    });

    it("leaves a test file alone, where a story sets up a state", async () => {
      const result = await lintAt(
        "packages/ui/src/__shadcn__/__shadcn__.test.tsx",
        `export const a = <div className="bg-pink-500 p-[13px]" />;\n`
      );

      expect(result.failed).toBe(false);
    });

    it("leaves a story file alone, where a demonstration may use any class", async () => {
      const result = await lintAt(
        "packages/ui/src/__shadcn__/__shadcn__.stories.tsx",
        `export const a = <div className="bg-pink-500 p-[13px]" />;\n`
      );

      expect(result.failed).toBe(false);
    });

    it("does not reach a path outside the product UI globs", async () => {
      const result = await lintAt(
        "packages/core/src/__shadcn__/__shadcn__.tsx",
        `export const a = <div className="bg-pink-500 p-[13px]" />;\n`
      );

      expect(result.failed).toBe(false);
    });
  }
);
