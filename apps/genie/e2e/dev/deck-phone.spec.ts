import { expect, test, type Locator, type Page } from "@playwright/test";

import { SLIDES_CHANGE_DECK_ID } from "../../testing/slides-change.ts";
import { expectNoAxeViolations } from "../support/axe.ts";
import { withDeploymentLock } from "../support/lock.ts";
import {
  FIRST_PAINT,
  hideDevelopmentWidgets,
  signInAs,
} from "./ask-support.ts";
import { LEDGER_LOCK, LOCK_WAIT } from "./dev-support.ts";
import { DEV_MODULES, SLIDES_PEOPLE } from "./global-setup.ts";
import {
  closeSlidesDatabase,
  type DeckContent,
  removeOwnDecks,
  resetChangeDeck,
} from "./slides-support.ts";

test.skip(
  !DEV_MODULES.has("slides"),
  "The phone dock lives on the Slides module's deck page."
);

/**
 * The deck page below 768 px (czjw.176, deck-phone.prototype.html): the top bar, the dock with and
 * without a selection, and the More sheet; at a desktop the header and the editor bar it keeps.
 */

test.beforeEach(({ page }) => hideDevelopmentWidgets(page));

test.afterAll(closeSlidesDatabase);

const phone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

async function activate(page: Page, target: Locator): Promise<void> {
  if (phone(page)) {
    await target.tap();

    return;
  }

  await target.click();
}

/** Opens the fixed deck (or `content` under `title`) as the chat person, under the ledger lock. */
async function onDeck(
  page: Page,
  run: () => Promise<void>,
  deck?: { readonly content: DeckContent; readonly title: string }
): Promise<void> {
  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await resetChangeDeck(SLIDES_PEOPLE.chat, deck?.content, deck?.title);

      try {
        await signInAs(page, SLIDES_PEOPLE.chat);
        await page.goto(`/m/slides/decks/${SLIDES_CHANGE_DECK_ID}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeAttached(
          FIRST_PAINT
        );
        // The page settles before the first press (P03-15).
        await page.waitForLoadState("networkidle");
        await run();
      } finally {
        await removeOwnDecks(SLIDES_PEOPLE.chat);
      }
    },
    LOCK_WAIT
  );
}

const slideTools = (page: Page) =>
  page.getByRole("toolbar", { name: "Slide tools" });

const deckCanvas = (page: Page) =>
  page.locator("main [data-shown-slide] [data-slide-canvas]");

async function topOf(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();

  if (box === null) throw new Error(`${locator.toString()} has no box`);

  return box.y;
}

test("the top bar, the dock and Done on a phone; the header and the editor bar on a desktop", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 120_000);

  await onDeck(page, async () => {
    const text = page.getByRole("button", { name: /^Text "Every figure/ });

    if (!phone(page)) {
      // The phone work leaves the desktop as built: Export, More and Present in the header, Add
      // element and Background above the slide, the element's style row in the page, no dock.
      const canvasTop = await topOf(deckCanvas(page));

      const tops = await Promise.all(
        [
          "Export to PowerPoint",
          "More ways to present",
          "Add element",
          "Background",
        ].map(async (name) => {
          const control = page.getByRole("button", { name });

          await expect(control).toBeVisible();

          return [name, (await topOf(control)) < canvasTop] as const;
        })
      );

      expect(tops.filter(([, above]) => !above)).toEqual([]);

      await expect(slideTools(page)).toBeHidden();
      await expectNoAxeViolations(page, "desktop deck page");

      await activate(page, text);

      const row = page.getByRole("toolbar", { name: "Text style" });

      await expect(row).toBeVisible();
      expect(await topOf(row)).toBeLessThan(canvasTop);
      await expectNoAxeViolations(page, "desktop element style row");

      return;
    }

    const dock = slideTools(page);

    await expect(dock).toBeVisible();
    // P13-9: Back, the title (hidden from a screen reader), Undo, Ask, Present.
    await expect.soft(page.locator("[data-page-top-bar]")).toMatchAriaSnapshot(`
      - link /^Back to /
      - button "Undo"
      - button "Ask"
      - button "Present"
    `);
    await expect.soft(dock).toMatchAriaSnapshot(`
      - toolbar "Slide tools":
        - button "Add element"
        - button "Background"
        - button "Edit slide"
        - button "More"
    `);

    // With Ask closed, no bottom panel lifts the dock off the screen's bottom edge.
    const bar = await dock.locator("..").boundingBox();
    const height = await page.evaluate(() => window.innerHeight);

    expect
      .soft(Math.abs((bar?.y ?? 0) + (bar?.height ?? 0) - height))
      .toBeLessThanOrEqual(1);
    await expectNoAxeViolations(page, "phone deck page");

    await activate(page, text);

    // P13-17: the element's name and Done above its tools.
    const elementTools = page.getByRole("toolbar", { name: "Text style" });

    await expect(elementTools).toBeVisible();
    await expect(dock).toBeHidden();
    await expect(page.getByText("Text box", { exact: true })).toBeVisible();
    await expect.soft(elementTools).toMatchAriaSnapshot(`
      - toolbar "Text style":
        - button "Text"
        - button "Fill"
        - button "Border"
        - button "Position"
        - button "More"
    `);
    await expectNoAxeViolations(page, "phone element dock");

    await activate(page, page.getByRole("button", { name: "Done" }));
    await expect(elementTools).toBeHidden();
    await expect(dock).toBeVisible();
  });
});

test("Export and Present with notes download the deck and open the presenter window", async ({
  page,
  context,
}) => {
  test.setTimeout(LOCK_WAIT + 180_000);

  await onDeck(page, async () => {
    const sheet = page.getByRole("dialog", { name: "Deck and slide actions" });

    // On a phone both actions sit in the dock's More sheet; on a desktop in the header.
    const openMore = async () => {
      if (!phone(page)) return;

      await activate(
        page,
        slideTools(page).getByRole("button", { name: "More", exact: true })
      );
      await expect(sheet).toBeVisible();
    };

    await openMore();

    if (phone(page)) await expectNoAxeViolations(page, "phone More sheet");

    const downloading = page.waitForEvent("download", FIRST_PAINT);

    await activate(
      page,
      (phone(page) ? sheet : page).getByRole("button", {
        name: "Export to PowerPoint",
      })
    );
    expect((await downloading).suggestedFilename()).toMatch(/\.pptx$/);

    await openMore();

    if (!phone(page)) {
      await activate(
        page,
        page.getByRole("button", { name: "More ways to present" })
      );
      await expectNoAxeViolations(page, "desktop present menu");
    }

    // After axe, which opens and closes a page of its own.
    const opened = context.waitForEvent("page", FIRST_PAINT);

    await activate(
      page,
      phone(page)
        ? sheet.getByRole("button", { name: "Present with notes" })
        : page.getByRole("menuitem", { name: /^Present with notes/ })
    );

    const presenter = await opened;

    await presenter.waitForLoadState();
    expect(new URL(presenter.url()).pathname).toBe(
      `/m/slides/decks/${SLIDES_CHANGE_DECK_ID}/presenter`
    );
    await presenter.close();
  });
});

/** The longest title the deck table holds (`deck_title_check`, 80 characters). */
const LONG_TITLE =
  "Collections review for October with every overdue account and each reminder sent";

const TWELVE_SLIDES: DeckContent = {
  slides: Array.from({ length: 12 }, (_, index) => ({
    id: `s${index + 1}`,
    elements: [
      { kind: "title" as const, text: `Collections for week ${index + 1}` },
    ],
  })),
};

// The dock and the sheet are fixed and inset-x-0, so they never widen a scroll area: a too-wide
// row spills inside its own box instead.
const fits = (box: Locator) =>
  box.evaluate((element) => ({
    right: element.getBoundingClientRect().right <= window.innerWidth,
    inner: element.scrollWidth - element.clientWidth,
  }));

const fitting = { right: true, inner: 0 };

test("at 360 px a long title ends in an ellipsis and nothing runs past the screen", async ({
  page,
}) => {
  test.skip(!phone(page), "A 360 px phone.");
  test.setTimeout(LOCK_WAIT + 120_000);

  await page.setViewportSize({ width: 360, height: 780 });

  // Inside the shell the content area scrolls, so a wide part shows there, not in the document.
  const overflow = () =>
    page.evaluate(() => {
      const root = document.documentElement;
      const area = document.querySelector("[data-shell-content]");

      return {
        document: root.scrollWidth - root.clientWidth,
        content: area === null ? -1 : area.scrollWidth - area.clientWidth,
      };
    });

  const none = { document: 0, content: 0 };

  await onDeck(
    page,
    async () => {
      const topBar = page.locator("[data-page-top-bar]");
      const title = topBar.locator("p[title]");

      expect
        .soft(
          await title.evaluate(
            (element) => element.scrollWidth > element.clientWidth
          ),
          "the top bar title is cut with an ellipsis"
        )
        .toBe(true);

      const present = await topBar
        .getByRole("button", { name: "Present", exact: true })
        .boundingBox();

      expect
        .soft((present?.x ?? 360) + (present?.width ?? 0))
        .toBeLessThanOrEqual(360);
      expect.soft(await overflow(), "idle").toEqual(none);

      await activate(
        page,
        page.getByRole("button", { name: /^Title "Collections for week 1"/ })
      );
      await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
      expect.soft(await overflow(), "with a selection").toEqual(none);
      expect
        .soft(
          await fits(
            page.getByRole("toolbar", { name: "Title style" }).locator("..")
          ),
          "the element dock"
        )
        .toEqual(fitting);
      await activate(page, page.getByRole("button", { name: "Done" }));

      await activate(
        page,
        slideTools(page).getByRole("button", { name: "More", exact: true })
      );

      const sheet = page.getByRole("dialog", {
        name: "Deck and slide actions",
      });

      await expect(sheet).toBeVisible();
      expect.soft(await overflow(), "with More open").toEqual(none);
      expect.soft(await fits(sheet), "the More sheet").toEqual(fitting);
      await page.keyboard.press("Escape");

      const last = page
        .getByRole("navigation", { name: "Slides" })
        .getByRole("button", { name: /^Slide 12:/ });

      await activate(page, last);
      await expect(last).toHaveAttribute("aria-current", "true");
      expect.soft(await overflow(), "at the strip's end").toEqual(none);
    },
    { content: TWELVE_SLIDES, title: LONG_TITLE }
  );
});
