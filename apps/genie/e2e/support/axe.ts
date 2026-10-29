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
  // An overlay that is still fading in reads as low contrast. Base UI marks one entering or leaving
  // with these attributes before its transition starts, so both settle before axe measures.
  await page.waitForFunction(
    () =>
      document.querySelector("[data-starting-style], [data-ending-style]") ===
      null,
    undefined,
    { polling: 100 }
  );
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) => animation.effect?.getTiming().iterations !== Infinity
        )
        .map((animation) => animation.finished.catch(() => undefined))
    )
  );

  // Next streams the <title> after the page content (xok3.31), so axe waits for it. A page with no
  // title at all still reaches axe, which reports `document-title`.
  await page
    .waitForFunction(() => document.title !== "", undefined, {
      polling: 100,
      timeout: 10_000,
    })
    .catch(() => undefined);

  const results = await new AxeBuilder({ page }).withTags(WCAG_21_AA).analyze();

  expect(
    results.violations.map(
      (violation) =>
        `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`
    ),
    `${label} has axe violations`
  ).toEqual([]);
}
