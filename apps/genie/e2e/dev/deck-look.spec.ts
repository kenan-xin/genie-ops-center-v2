import { readFile } from "node:fs/promises";

import { readPptx } from "@genie/module-slides/testing";
import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  DECK_LOOK_CHART_SLIDE,
  DECK_LOOK_CONTENT,
  DECK_LOOK_DARK_THEME,
  DECK_LOOK_TITLE,
  SLIDES_THEME_MESSAGE,
} from "../../testing/deck-look.ts";
import {
  SLIDES_CHANGE_DECK_ID,
  SLIDES_CHANGE_DECK_TITLE,
} from "../../testing/slides-change.ts";
import { expectNoAxeViolations } from "../support/axe.ts";
import { withDeploymentLock } from "../support/lock.ts";
import {
  FIRST_PAINT,
  hideDevelopmentWidgets,
  signInAs,
} from "./ask-support.ts";
import { LEDGER_LOCK, LOCK_WAIT, onPhone } from "./dev-support.ts";
import { DEV_MODULES, SLIDES_PEOPLE } from "./global-setup.ts";
import {
  closeSlidesDatabase,
  removeOwnDecks,
  resetChangeDeck,
  resetDeckWithTheme,
  sendToSlidesAgent,
} from "./slides-support.ts";

test.skip(
  !(
    DEV_MODULES.has("analytics") &&
    DEV_MODULES.has("invoices") &&
    DEV_MODULES.has("placeholder") &&
    DEV_MODULES.has("slides")
  ),
  "The slides chat recordings hold the default selection's tool list."
);

/**
 * The designed deck look on the real deck page (czjw.183) and the slide chart labels (czjw.182):
 * the eight layouts in the brand look, a theme set by chat with its Undo, and the dark export.
 */

test.beforeEach(({ page }) => hideDevelopmentWidgets(page));

test.afterAll(closeSlidesDatabase);

/** The dev tenant's primary color, #2563EB, which the brand look draws the panel in. */
const BRAND_BLUE = "rgb(37, 99, 235)";

const WHITE = "rgb(255, 255, 255)";

/** The background of the "dark and minimal" theme, #030712. */
const DARK = "rgb(3, 7, 18)";

const shownCanvas = (page: Page) =>
  page.locator("main [data-shown-slide] [data-slide-canvas]");

const backgroundOf = (page: Page) =>
  shownCanvas(page).evaluate(
    (element) => getComputedStyle(element).backgroundColor
  );

async function activate(page: Page, target: Locator): Promise<void> {
  if (onPhone(page)) {
    await target.tap();

    return;
  }

  await target.click();
}

/** Shows slide `number` from the slide strip. */
async function showSlide(page: Page, number: number): Promise<void> {
  const button = page
    .getByRole("navigation", { name: "Slides" })
    .getByRole("button", { name: new RegExp(`^Slide ${number}:`) });

  await activate(page, button);
  await expect(button).toHaveAttribute("aria-current", "true");
}

/** A box's width and height as parts of the shown slide's, whatever the slide's scale. */
async function shareOfSlide(page: Page, box: Locator) {
  const slide = await shownCanvas(page).boundingBox();
  const inner = await box.boundingBox();

  if (slide === null || inner === null) throw new Error("a box is not drawn");

  return {
    width: inner.width / slide.width,
    height: inner.height / slide.height,
  };
}

type Rect = {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
};

const meet = (a: Rect, b: Rect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** Seeds the fixed deck (or `seed` in its place) for the chat person, opens it, runs, and removes it. */
async function onDeck(
  page: Page,
  seed: () => Promise<void>,
  title: string,
  run: () => Promise<void>
): Promise<void> {
  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await seed();

      try {
        await signInAs(page, SLIDES_PEOPLE.chat);
        await page.goto(`/m/slides/decks/${SLIDES_CHANGE_DECK_ID}`);
        await expect(
          page.getByRole("heading", { level: 1, name: title })
        ).toBeVisible(FIRST_PAINT);
        // On a phone a shift after hydration moves the slide under the press point (P03-15).
        await page.waitForLoadState("networkidle");
        await run();
      } finally {
        await removeOwnDecks(SLIDES_PEOPLE.chat);
      }
    },
    LOCK_WAIT
  );
}

const seedDeckLook = () =>
  // SAFETY: the fixture holds the stored deck shape; the store's parse refuses any other.
  resetChangeDeck(
    SLIDES_PEOPLE.chat,
    DECK_LOOK_CONTENT as never,
    DECK_LOOK_TITLE
  );

test("a deck draws the eight layouts in the brand look", async ({ page }) => {
  test.setTimeout(LOCK_WAIT + 120_000);

  await onDeck(page, seedDeckLook, DECK_LOOK_TITLE, async () => {
    const canvas = shownCanvas(page);
    const panel = canvas.locator("[data-slide-panel]");
    const footer = canvas.locator("footer");

    // The title slide: one panel in the primary color over the whole slide, and no footer.
    await expect(panel).toHaveCSS("background-color", BRAND_BLUE);

    const titlePanel = await shareOfSlide(page, panel);

    expect(titlePanel.width).toBeCloseTo(1, 2);
    expect(titlePanel.height).toBeCloseTo(1, 2);
    await expect(footer).toHaveCount(0);

    // A split slide: the 384 px panel of 960, and the company and the slide's place in the footer.
    await showSlide(page, 2);
    await expect(footer).toContainText("E2E · 2 / 8");
    expect((await shareOfSlide(page, panel)).width).toBeCloseTo(384 / 960, 2);

    await showSlide(page, 7);
    await expect(canvas.locator("[data-list-circle]")).toHaveCount(5);
    await expectNoAxeViolations(page, "the Priorities slide in the brand look");
  });
});

test("a chat request makes the deck dark and minimal, and Undo returns the brand look", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 180_000);

  await onDeck(
    page,
    () => resetChangeDeck(SLIDES_PEOPLE.chat),
    SLIDES_CHANGE_DECK_TITLE,
    async () => {
      await expect.poll(() => backgroundOf(page)).toBe(WHITE);

      const chat = await sendToSlidesAgent(page, SLIDES_THEME_MESSAGE);

      if (onPhone(page)) {
        await chat.getByRole("button", { name: "Close Ask" }).tap();
      }

      // The page reads the deck again when the answer ends, under the 10 s poll.
      await expect.poll(() => backgroundOf(page), { timeout: 5000 }).toBe(DARK);

      // The dev tenant has no logo, so the dark logo's place stays empty and the name shows alone.
      await showSlide(page, 2);

      const footer = shownCanvas(page).locator("footer");

      await expect(footer).toContainText("E2E · 2 / 2");
      await expect(footer.locator("img")).toHaveCount(0);
      expect(await backgroundOf(page)).toBe(DARK);

      await activate(page, page.getByRole("button", { name: "Undo" }));
      await expect.poll(() => backgroundOf(page), FIRST_PAINT).toBe(WHITE);
    }
  );
});

test("a slide chart keeps its first x label clear of the y axis and its source below the labels", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 120_000);

  await onDeck(page, seedDeckLook, DECK_LOOK_TITLE, async () => {
    await showSlide(page, DECK_LOOK_CHART_SLIDE);

    const charts = shownCanvas(page).locator("figure");

    await expect(charts).toHaveCount(2);
    await expect(
      charts.locator(".recharts-xAxis-tick-labels text").first()
    ).toBeVisible(FIRST_PAINT);

    // Each chart's x and y label boxes and its source line's top, in screen pixels.
    const drawn = await charts.evaluateAll((figures) =>
      figures.map((figure) => {
        const rects = (axis: string) =>
          [
            ...figure.querySelectorAll(
              `.recharts-${axis}Axis-tick-labels .recharts-cartesian-axis-tick-value`
            ),
          ].map((node) => {
            const { left, right, top, bottom } = node.getBoundingClientRect();

            return { left, right, top, bottom };
          });

        return {
          xs: rects("x"),
          ys: rects("y"),
          captionTop:
            figure.querySelector("figcaption")?.getBoundingClientRect().top ??
            null,
        };
      })
    );

    const failures: string[] = [];

    for (const [at, { xs, ys, captionTop }] of drawn.entries()) {
      if (xs.length === 0 || ys.length === 0 || captionTop === null) {
        failures.push(`chart ${at + 1} draws no axis labels or no source line`);
      } else {
        if (xs.some((x) => ys.some((y) => meet(x, y)))) {
          failures.push(`chart ${at + 1}: an x label meets a y label`);
        }

        if (xs.some((x) => captionTop < x.bottom)) {
          failures.push(
            `chart ${at + 1}: the source line starts above the lowest x label`
          );
        }
      }
    }

    expect(failures).toEqual([]);
  });
});

test("the export of a dark deck holds its background and theme colors @no-screen", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 120_000);

  await onDeck(
    page,
    () =>
      resetDeckWithTheme(
        SLIDES_PEOPLE.chat,
        // SAFETY: the fixture holds the stored deck shape; the store's parse refuses any other.
        DECK_LOOK_CONTENT as never,
        DECK_LOOK_DARK_THEME,
        DECK_LOOK_TITLE
      ),
    DECK_LOOK_TITLE,
    async () => {
      const downloading = page.waitForEvent("download", FIRST_PAINT);

      await page.getByRole("button", { name: "Export to PowerPoint" }).click();

      const path = await (await downloading).path();
      const deck = await readPptx(await readFile(path));
      const titleSlide = await deck.xmlOf("ppt/slides/slide1.xml");

      expect(titleSlide).toMatch(/<p:bg>.*030712.*<\/p:bg>/s);
      // The title takes the theme's text color, not the brand look's #111827.
      expect(titleSlide).toContain("F3F4F6");
    }
  );
});
