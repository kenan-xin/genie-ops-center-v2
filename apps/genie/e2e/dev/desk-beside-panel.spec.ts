import { expect, test, type Page } from "@playwright/test";

import { DOCUMENT_REVIEW_CHAT_ID } from "../../testing/document-review-chat.ts";
import { withDeploymentLock } from "../support/lock.ts";
import {
  closeAgentPanelDatabase,
  removeReviewDocument,
  resetReviewDocument,
} from "./agent-panel-support.ts";
import {
  hideDevelopmentWidgets,
  openAgentPanel,
  signInAs,
} from "./ask-support.ts";
import {
  expectPageDrawn,
  FIRST_PAINT,
  LEDGER_LOCK,
  LOCK_WAIT,
} from "./dev-support.ts";
import {
  ANALYTICS_PEOPLE,
  DEV_MODULES,
  INVOICE_ASK_PEOPLE,
} from "./global-setup.ts";

test.skip(!DEV_MODULES.has("invoices"), "The desks are the invoices module's.");

/**
 * The docked agent panel (400 px from 1280 px, Spec 07 R-42) narrows the page, so each invoices
 * desk chooses its layout from its own width (6wz1.96, P16g-4). The desktop runs at 1280 x 800 and
 * 1440 x 900 with the panel docked after the desk drew, so the resize path is the one proved; the
 * phone runs at its own viewport with the panel closed, because there the panel is a sheet (P16g-9).
 */

test.beforeEach(({ page }) => hideDevelopmentWidgets(page));

test.afterAll(() => closeAgentPanelDatabase());

const onDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

/** Every problem `expectPageClear` names; an empty list is a clear page. */
function pageProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    type Box = { left: number; top: number; right: number; bottom: number };

    const cut = (a: Box, b: Box): Box => ({
      left: Math.max(a.left, b.left),
      top: Math.max(a.top, b.top),
      right: Math.min(a.right, b.right),
      bottom: Math.min(a.bottom, b.bottom),
    });

    const width = (box: Box) => Math.max(0, box.right - box.left);
    const height = (box: Box) => Math.max(0, box.bottom - box.top);

    // The part of `element` a person sees: cut by each clipping ancestor's inner box, then the viewport.
    const visible = (element: Element): Box => {
      let box: Box = element.getBoundingClientRect();

      for (let at = element.parentElement; at !== null; at = at.parentElement) {
        const { overflowX, overflowY } = getComputedStyle(at);

        if (overflowX === "visible" && overflowY === "visible") continue;

        const outer = at.getBoundingClientRect();
        const left = outer.left + at.clientLeft;
        const top = outer.top + at.clientTop;

        box = cut(box, {
          left,
          top,
          right: left + at.clientWidth,
          bottom: top + at.clientHeight,
        });
      }

      const root = document.documentElement;

      return cut(box, {
        left: 0,
        top: 0,
        right: root.clientWidth,
        bottom: root.clientHeight,
      });
    };

    const problems: string[] = [];
    const pdf = document.querySelector("[data-document-viewer] canvas");

    if (pdf === null) return ["no PDF page"];

    const shownPage = visible(pdf);

    // The pager's lens draws the page at 114% of its width on purpose (`LENS_PAGE`), so there the
    // page is meant to show only the lens's part of it.
    const lens = pdf.closest("[data-review-lens]");
    const whole = pdf.getBoundingClientRect();

    const pageWidth = width(
      lens === null ? whole : cut(whole, lens.getBoundingClientRect())
    );

    // A page not drawn, or out of sight, would otherwise pass with nothing over it.
    if (width(shownPage) * height(shownPage) === 0 || height(shownPage) < 40)
      return ["page not drawn"];

    if (width(shownPage) < 0.9 * pageWidth)
      problems.push(
        `cut off: ${Math.round(width(shownPage))} of ${Math.round(pageWidth)} px`
      );

    for (const element of document.querySelectorAll(
      // Not the narrow desk's sticky sheet: it is the designed layout, and the PDF scrolls clear of it (pb-40, measured).
      "[data-pin-card], [data-pin], [data-field], aside"
    )) {
      if (!element.checkVisibility() || element.contains(pdf)) continue;

      const name =
        element.getAttribute("aria-label") ??
        (element.hasAttribute("data-pin-card")
          ? `pin ${element.getAttribute("data-pin-card")}`
          : element.hasAttribute("data-pin")
            ? `card ${element.getAttribute("data-pin")}`
            : `field ${element.getAttribute("data-field")}`);

      const shown = visible(element);
      const over = cut(shown, shownPage);
      const box = element.getBoundingClientRect();

      // Above 1 px², so a shared sub-pixel edge is no cover.
      if (width(over) * height(over) > 1)
        problems.push(`${name} covers the page`);

      if (
        element.hasAttribute("data-pin-card") &&
        width(shown) * height(shown) < 0.9 * box.width * box.height
      )
        problems.push(`${name} is cut off`);
    }

    return problems;
  });
}

/**
 * Fails with every problem it finds (6wz1.96): the first drawn PDF page shows less than 90% of
 * its width, a desk card or a side column overlaps the page's visible part, or a pinned card
 * shows less than 90% of its area.
 */
async function expectPageClear(page: Page): Promise<void> {
  // Polled, because the docked panel narrows the desk and the PDF redraws at the new width.
  await expect.poll(() => pageProblems(page), { timeout: 15_000 }).toEqual([]);
}

test("the record desk keeps its PDF clear beside the docked agent panel (6wz1.96)", async ({
  page,
}) => {
  test.setTimeout(FIRST_PAINT.timeout + 120_000);

  const desktop = onDesktop(page);

  if (desktop) await page.setViewportSize({ width: 1280, height: 800 });

  // This project's invoice person, so the two projects never share a session.
  await signInAs(
    page,
    desktop ? INVOICE_ASK_PEOPLE.desktop : INVOICE_ASK_PEOPLE.phone
  );
  await page.goto("/m/invoices/invoices");
  await expect(
    page.getByRole("heading", { level: 1, name: "Invoices" })
  ).toBeVisible(FIRST_PAINT);
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "INV-2026-09-03", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "INV-2026-09-03" })
  ).toBeVisible(FIRST_PAINT);
  await expectPageDrawn(page);

  if (!desktop) {
    await expectPageClear(page);

    return;
  }

  // The real shell leaves the desk above DESK_PINS_FROM at 1280 px while the panel is closed.
  await expect(
    page.getByRole("complementary", { name: "Payments and history" })
  ).toBeVisible();

  await openAgentPanel(page);
  await expectPageDrawn(page);
  await expectPageClear(page);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(
    page.getByRole("region", { name: "Agent", exact: true })
  ).toBeVisible();
  // P16g-5: at 1440 px with the panel docked the record desk is narrow, with its sheet.
  await expect(
    page.getByRole("region", { name: "Details of INV-2026-09-03" })
  ).toBeVisible();
  await expectPageDrawn(page);
  await expectPageClear(page);
});

test("the review desk keeps its PDF clear beside the docked agent panel (6wz1.96)", async ({
  page,
}) => {
  // The one dev person who may write invoices and ask; it exists only with analytics.
  test.skip(
    !DEV_MODULES.has("analytics"),
    "The review desk's person is the analytics chat person."
  );
  test.setTimeout(LOCK_WAIT + 180_000);

  // The fixed document is shared by both projects and shows in the inbox counts of other specs.
  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await resetReviewDocument();

      try {
        const desktop = onDesktop(page);

        if (desktop) await page.setViewportSize({ width: 1280, height: 800 });

        // Only a person who may write gets the review desk; a reader gets the read-only review.
        await signInAs(page, ANALYTICS_PEOPLE.chat);
        await page.goto(`/m/invoices/documents/${DOCUMENT_REVIEW_CHAT_ID}`);
        await expectPageDrawn(page);

        if (!desktop) {
          await expectPageClear(page);

          return;
        }

        const beforeYouSave = page.getByRole("complementary", {
          name: "Before you save",
        });

        // The wide desk: its fields pinned beside their lines, none listed in the panel.
        await expect(beforeYouSave).toBeVisible();
        await expect(
          beforeYouSave.getByRole("region", {
            name: "On the page",
            exact: true,
          })
        ).toHaveCount(0);

        // The pager beside the docked panel.
        await openAgentPanel(page);
        await expect(page.locator("[data-review-lens]")).toBeVisible();
        await expectPageDrawn(page);
        await expectPageClear(page);

        // The middle desk: every card in the panel.
        await page.setViewportSize({ width: 1440, height: 900 });
        await expect(beforeYouSave).toBeVisible(FIRST_PAINT);
        await expectPageDrawn(page);
        await expectPageClear(page);
      } finally {
        await removeReviewDocument();
      }
    },
    LOCK_WAIT
  );
});
