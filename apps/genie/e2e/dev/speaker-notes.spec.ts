import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  SLIDES_CHANGE_CONTENT,
  SLIDES_CHANGE_DECK_ID,
  SLIDES_CHANGE_DECK_TITLE,
  SLIDES_CHANGE_OLD_TITLE,
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
  type DeckContent,
  removeOwnDecks,
  resetChangeDeck,
} from "./slides-support.ts";

test.skip(
  !DEV_MODULES.has("slides"),
  "The speaker notes live on the Slides module's deck page."
);

/**
 * Speaker notes and the presenter window (S7-45, AC-14) on the fixed deck of `slides-change.ts`.
 * No chat runs, so the deck may carry notes the chat recordings never saw; the next spec's reset
 * puts the plain deck back.
 */

// The context's script also reaches the presenter pop-up, which a page's script does not.
test.beforeEach(({ context }) => hideDevelopmentWidgets(context));

test.afterAll(closeSlidesDatabase);

const NOTES = {
  s1: "Open with the October total.",
  s2: "The reminder emails started in September.",
} as const;

const [TITLE_SLIDE, FIGURE_SLIDE] = SLIDES_CHANGE_CONTENT.slides;

/** The fixed deck with plain-text notes on each slide. */
const NOTED_DECK: DeckContent = {
  slides: [
    { ...TITLE_SLIDE, notes: NOTES.s1 },
    { ...FIGURE_SLIDE, notes: NOTES.s2 },
  ],
};

async function activate(page: Page, target: Locator): Promise<void> {
  if (onPhone(page)) {
    await target.tap();

    return;
  }

  await target.click();
}

/** Opens the deck page and lets it settle before the first press (P03-15). */
async function openDeck(page: Page): Promise<void> {
  await page.goto(`/m/slides/decks/${SLIDES_CHANGE_DECK_ID}`);
  await expect(
    page.getByRole("heading", { level: 1, name: SLIDES_CHANGE_DECK_TITLE })
  ).toBeVisible(FIRST_PAINT);
  await page.waitForLoadState("networkidle");
}

/** Runs one case on the fixed deck, signed in as the chat person, under the ledger lock. */
async function onFixedDeck(
  page: Page,
  content: DeckContent | undefined,
  run: () => Promise<void>
): Promise<void> {
  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await resetChangeDeck(SLIDES_PEOPLE.chat, content);

      try {
        await signInAs(page, SLIDES_PEOPLE.chat);
        await openDeck(page);
        await run();
      } finally {
        await removeOwnDecks(SLIDES_PEOPLE.chat);
      }
    },
    LOCK_WAIT
  );
}

test("the presenter window follows the audience window and moves it back", async ({
  page,
  context,
}) => {
  test.setTimeout(LOCK_WAIT + 120_000);

  await onFixedDeck(page, NOTED_DECK, async () => {
    await activate(
      page,
      page.getByRole("button", { name: "More ways to present" })
    );

    const opened = context.waitForEvent("page");

    await activate(
      page,
      page.getByRole("menuitem", { name: /^Present with notes/ })
    );

    const presenter = await opened;

    await presenter.waitForLoadState();
    expect(new URL(presenter.url()).pathname).toBe(
      `/m/slides/decks/${SLIDES_CHANGE_DECK_ID}/presenter`
    );

    const presenterAt = (number: number) =>
      presenter
        .getByRole("toolbar", { name: "Presentation" })
        .getByText(`${number} / 2`, { exact: true });

    const audienceAt = (number: number) =>
      page
        .getByRole("toolbar", { name: "Presentation" })
        .getByText(`${number} / 2`, { exact: true });

    await expect(audienceAt(1)).toBeVisible(FIRST_PAINT);
    await expect(presenterAt(1)).toBeVisible(FIRST_PAINT);
    await expect(
      presenter.getByRole("region", { name: "Notes for slide 1" })
    ).toHaveText(NOTES.s1);

    // The pop-up took the focus; the key goes to present mode in the audience window.
    await page.bringToFront();
    await page.keyboard.press("ArrowRight");
    await expect(audienceAt(2)).toBeVisible(FIRST_PAINT);

    await expect(presenterAt(2)).toBeVisible(FIRST_PAINT);
    await expect(
      presenter
        .getByRole("region", { name: "Now showing" })
        .getByText(SLIDES_CHANGE_OLD_TITLE)
    ).toBeVisible();
    await expect(
      presenter.getByRole("region", { name: "Notes for slide 2" })
    ).toHaveText(NOTES.s2);
    await expect(
      presenter
        .getByRole("status")
        .filter({ hasText: "Audience window follows" })
    ).toBeVisible();
    await expectNoAxeViolations(presenter, "presenter window on slide 2");

    await presenter.bringToFront();
    await activate(
      presenter,
      presenter.getByRole("button", { name: "Previous slide" })
    );
    await expect(presenterAt(1)).toBeVisible(FIRST_PAINT);
    await expect(audienceAt(1)).toBeVisible(FIRST_PAINT);
    await expect(
      presenter.getByRole("region", { name: "Notes for slide 1" })
    ).toHaveText(NOTES.s1);

    // Exit closes the pop-up the deck page opened (the page's default exit).
    const closed = presenter.waitForEvent("close", { timeout: 10_000 });

    // Exit closes this window, so the tap can lose its page before it returns; `closed` still
    // proves the close, and any other error fails the test.
    const [exit] = await Promise.allSettled([
      activate(presenter, presenter.getByRole("button", { name: "Exit" })),
    ]);

    if (exit.status === "rejected" && !presenter.isClosed()) throw exit.reason;
    await closed;
  });
});

test("notes typed under the slide stay after a reload, and Undo removes them", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 120_000);

  const typed = "Pause on the October total before the next slide.";

  const notes = page.getByRole("textbox", { name: "Speaker notes" });

  await onFixedDeck(page, undefined, async () => {
    await notes.fill(typed);
    await expect(page.getByText("Saved", { exact: true })).toBeVisible(
      FIRST_PAINT
    );

    await page.reload();
    await openDeck(page);
    await expect(notes).toHaveValue(typed);

    await activate(page, page.getByRole("button", { name: "Undo" }));
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled(
      FIRST_PAINT
    );
    await expect(notes).toHaveValue("");
  });
});
