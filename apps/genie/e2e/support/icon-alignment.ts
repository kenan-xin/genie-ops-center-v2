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
  // The app preloads its web font; a late swap moves every text line the check measures against.
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const { relations } = await page.evaluate(
    measureIconAlignment,
    ICON_ALIGNMENT_ALLOW_LIST
  );

  return iconAlignmentProblems(relations);
}

/** The two widths of `6wz1.113`, by Playwright project. */
export const iconCheckSize = (project: string) =>
  project === "phone"
    ? { width: 390, height: 844 }
    : { width: 1440, height: 900 };

export type IconCheckRoute = {
  readonly path: string;
  /** The prefix of its findings when the path carries a per-run id. */
  readonly label?: string;
  /** What shows once the page drew, beyond its heading. */
  readonly ready?: (page: Page) => Promise<void>;
};

/**
 * Opens a route and waits until it drew: its own path (home may land elsewhere, R-34), a heading,
 * no refusal and no loading skeleton, so a green run never measures the wrong page.
 */
async function measureRoute(
  page: Page,
  base: string,
  route: IconCheckRoute,
  paint: { readonly timeout?: number }
): Promise<string[]> {
  await page.goto(`${base}${route.path}`);

  if (route.path !== "/")
    await expect.poll(() => new URL(page.url()).pathname).toBe(route.path);

  await expect(page.locator("h1").first()).toBeVisible(paint);
  await expect(
    page.getByRole("heading", { name: "You do not have access to this page" })
  ).toHaveCount(0);
  await route.ready?.(page);
  await expect(
    page
      .locator('main[aria-busy="true"], [data-slot="skeleton"]')
      .filter({ visible: true })
  ).toHaveCount(0, paint);

  const prefix = `${route.label ?? route.path} ${page.viewportSize()?.width}`;

  return (await iconAlignmentFindings(page)).map(
    (line) => `${prefix}: ${line}`
  );
}

/** Measures each route in turn, every finding prefixed with the route and the width. */
export async function walkIconAlignment(
  page: Page,
  routes: readonly IconCheckRoute[],
  options: {
    readonly base?: string | undefined;
    readonly paint?: { timeout?: number };
  } = {}
): Promise<string[]> {
  const findings: string[] = [];

  for (const route of routes) {
    const base = options.base ?? "";
    // oxlint-disable-next-line no-await-in-loop -- one page visits the routes in turn
    const lines = await measureRoute(page, base, route, options.paint ?? {});

    findings.push(...lines);
  }

  return findings;
}

/** One assertion over a whole walk, so one red run lists every route. */
export function expectNoIconFindings(findings: readonly string[]): void {
  expect(
    findings,
    `${findings.length} icons out of line with their text`
  ).toEqual([]);
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
