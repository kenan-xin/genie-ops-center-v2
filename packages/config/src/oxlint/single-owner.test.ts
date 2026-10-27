import { describe, expect, it } from "vitest";

import { lintAtIsolated } from "./__testing__/lint-at.ts";

const LINT_TIMEOUT = 120_000;

// Every case lints from a temporary root, so no fixture lands in a source tree
// that an app test scans at the same time (6wz1.16).

const CORE_SCREEN =
  "packages/core/src/features/__shadcn__/__shadcn__-owner.tsx";

const OWNED_CONSTANT = `export const focusRing = "ring-2";\n`;

describe.concurrent(
  "R-19a: a design-system part has one owner, proved through the oxlint binary",
  { timeout: LINT_TIMEOUT },
  () => {
    it("refuses a second focusRing declaration outside packages/ui", async () => {
      const result = await lintAtIsolated(CORE_SCREEN, OWNED_CONSTANT);

      expect(result.failed).toBe(true);

      expect(result.output).toMatch(/single-owner/);
    });

    it("refuses a second ConfirmDialog declaration outside packages/ui", async () => {
      const result = await lintAtIsolated(
        CORE_SCREEN,
        "export function ConfirmDialog() { return null; }\n"
      );

      expect(result.failed).toBe(true);

      expect(result.output).toMatch(/single-owner/);
    });

    it("refuses a re-export of the owner's name, the deleted kit shape", async () => {
      const result = await lintAtIsolated(
        CORE_SCREEN,
        `import { focusRing } from "@genie/ui";\nexport { focusRing };\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toMatch(/single-owner/);
    });

    it("refuses a hand-made role=dialog", async () => {
      const result = await lintAtIsolated(
        CORE_SCREEN,
        `export const a = <div role="dialog" aria-label="Remove" />;\n`
      );

      expect(result.failed).toBe(true);

      expect(result.output).toMatch(/single-owner/);
    });

    it("allows importing and using the one owner", async () => {
      const result = await lintAtIsolated(
        CORE_SCREEN,
        `import { focusRing } from "@genie/ui";\nexport const a = <button type="button" className={focusRing}>Open</button>;\n`
      );

      expect(result.output).not.toMatch(/single-owner/);
    });

    it("lets packages/ui declare its own parts", async () => {
      const result = await lintAtIsolated(
        "packages/ui/src/__shadcn__/__shadcn__-owner.tsx",
        OWNED_CONSTANT
      );

      expect(result.output).not.toMatch(/single-owner/);
    });

    it("covers a module the same as core", async () => {
      const result = await lintAtIsolated(
        "packages/modules/placeholder/src/__shadcn__/__shadcn__-owner.tsx",
        OWNED_CONSTANT
      );

      expect(result.failed).toBe(true);

      expect(result.output).toMatch(/single-owner/);
    });
  }
);
