import { AxeBuilder } from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * The accessibility criterion is WCAG 2.1 AA (DEC-21, `docs/core/tech-stack.md`), a tag set, not
 * every rule axe ships; `placeholder.spec.ts` records why the best-practice rules stay out.
 */
const WCAG_21_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/** Runs axe over the current page and fails with the rule ids and targets it reports. */
export async function expectNoAxeViolations(
  page: Page,
  label: string
): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_21_AA).analyze();

  expect(
    results.violations.map(
      (violation) =>
        `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`
    ),
    `${label} has axe violations`
  ).toEqual([]);
}
