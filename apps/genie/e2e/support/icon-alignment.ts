import {
  ICON_ALIGNMENT_ALLOW_LIST,
  iconAlignmentProblems,
  measureIconAlignment,
} from "@genie/ui/testing/icon-alignment";
import { expect, type Page } from "@playwright/test";

import { waitForSettledScreen } from "./axe.ts";

/**
 * Lists every icon whose ink is more than 1 px off the text edge of its column or off the center
 * of its first text line, measured on the settled screen.
 */
export async function iconAlignmentFindings(page: Page): Promise<string[]> {
  await waitForSettledScreen(page);

  const { relations } = await page.evaluate(
    measureIconAlignment,
    ICON_ALIGNMENT_ALLOW_LIST
  );

  return iconAlignmentProblems(relations);
}

/** Fails with every finding of `iconAlignmentFindings`. */
export async function expectIconAlignment(
  page: Page,
  label: string
): Promise<void> {
  const findings = await iconAlignmentFindings(page);

  expect(findings, `${label} has an icon out of line with its text`).toEqual(
    []
  );
}
