import { describe, expect, it } from "vitest";

import { lintAt } from "./__testing__/lint-at.ts";
import { sharedOxlintConfig } from "./index.ts";

const LINT_TIMEOUT = 120_000;

const DISCLOSURE = `import { Disclosure } from "@genie/ui";\n`;

const BUTTON = `import { Button } from "@genie/ui";\n\n`;

const CORE_SCREEN = "packages/core/src/features/__shadcn__/__shadcn__.tsx";

describe.concurrent(
  "the @shadcn/lint design-system rules run through the shared lint target",
  { timeout: LINT_TIMEOUT },
  () => {
    it("rejects a restyle of a design-system component", async () => {
      const result = await lintAt(
        "packages/ui/src/__shadcn__/__shadcn__.tsx",
        `${DISCLOSURE}export const a = <Disclosure summary="x" className="p-4" />;\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toMatch(/no-restyle/);
    });

    it("lets a screen place a design-system component with layout classes", async () => {
      const result = await lintAt(
        CORE_SCREEN,
        `${BUTTON}export const a = <Button className="mt-2 w-full md:w-auto" />;\n`
      );

      expect(result.failed).toBe(false);
    });

    it("refuses a height class on a design-system component (R-5)", async () => {
      const result = await lintAt(
        CORE_SCREEN,
        `${BUTTON}export const a = <Button className="h-12" />;\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toMatch(/no-restyle/);
    });

    it("still refuses a color class on a design-system component", async () => {
      const result = await lintAt(
        CORE_SCREEN,
        `${BUTTON}export const a = <Button className="bg-muted" />;\n`
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

    it("applies no-inline-styles to the ThemeProvider like every other product file", () => {
      const exceptions = (sharedOxlintConfig.overrides ?? []).filter(
        (entry) =>
          entry.rules?.["shadcn/no-inline-styles"] === "off" &&
          entry.files?.includes("packages/ui/src/theme/theme-provider.tsx")
      );

      expect(exceptions).toHaveLength(0);
    });

    it("pins the one accepted exception, the branding style element, to one file and one rule", () => {
      const exceptions = (sharedOxlintConfig.overrides ?? []).filter((entry) =>
        entry.files?.includes(
          "packages/core/src/features/shell/branding-head.tsx"
        )
      );

      expect(exceptions.map((entry) => [entry.files, entry.rules])).toEqual([
        [
          ["packages/core/src/features/shell/branding-head.tsx"],
          { "shadcn/no-inline-styles": "off" },
        ],
      ]);
    });

    it("pins the fixed-tone exception to the status tone files and one rule", () => {
      const exceptions = (sharedOxlintConfig.overrides ?? []).filter(
        (entry) =>
          entry.rules?.["shadcn/no-raw-colors"] === "off" &&
          entry.files?.some((file) => file.startsWith("packages/ui/src/"))
      );

      expect(exceptions.map((entry) => [entry.files, entry.rules])).toEqual([
        [
          [
            "packages/ui/src/components/badge.tsx",
            "packages/ui/src/components/field.tsx",
            "packages/ui/src/parts/toast.tsx",
          ],
          { "shadcn/no-raw-colors": "off" },
        ],
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
