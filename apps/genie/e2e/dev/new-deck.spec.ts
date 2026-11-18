import { expect, test, type Page } from "@playwright/test";

import {
  SLIDES_CHANGE_DECK_ID,
  SLIDES_CHANGE_DECK_TITLE,
} from "../../testing/slides-change.ts";
import { DESCRIBED_DECK } from "../../testing/slides-describe.ts";
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
} from "./slides-support.ts";
import {
  activate,
  closeSurfaceDatabase,
  countsUntil,
  warm,
} from "./surface-support.ts";

test.skip(
  !(
    DEV_MODULES.has("analytics") &&
    DEV_MODULES.has("invoices") &&
    DEV_MODULES.has("placeholder") &&
    DEV_MODULES.has("slides")
  ),
  "The synthetic new-deck fixtures hold the default selection's tool list."
);

/**
 * A deck drafted from a description (S7-48): New deck on the Slides list starts the Slides agent,
 * and the worker of `global-setup.ts` runs it. The model answers come from the SYNTHETIC fixtures
 * `synthetic-new-deck-1.json` to `-5.json` (see `slides-describe.ts`), which the owner records live
 * in R1. Answers 1, 3 and 4 stream for about 4.5 s, so the checks on a draft in progress keep a
 * wide margin.
 */

test.beforeEach(({ page }) => hideDevelopmentWidgets(page));

test.afterAll(async () => {
  await closeSlidesDatabase();
  await closeSurfaceDatabase();
});

const slideButtons = (page: Page) =>
  page
    .getByRole("navigation", { name: "Slides" })
    .getByRole("button", { name: /^Slide \d+:/ });

const pill = (page: Page, text: string | RegExp) =>
  page.getByRole("status").filter({ hasText: text });

const slideCount = (count: number) =>
  count === 1 ? "1 slide" : `${count} slides`;

/**
 * Signs in as the Slides chat person, compiles the pages the run shows, then describes the deck on
 * the Slides list and presses Enter. Answers the new deck's path and its chat id.
 */
async function describeDeck(
  page: Page
): Promise<{ readonly path: string; readonly chatId: string }> {
  await signInAs(page, SLIDES_PEOPLE.chat);
  await resetChangeDeck(SLIDES_PEOPLE.chat);
  await warm(
    page,
    `/m/slides/decks/${SLIDES_CHANGE_DECK_ID}`,
    SLIDES_CHANGE_DECK_TITLE
  );

  await warm(page, "/m/slides/decks", "Slides");

  const box = page.getByRole("textbox", { name: "What is the deck about?" });

  // A press before hydration does nothing, so press until the composer opens.
  await expect(async () => {
    if (!(await box.isVisible())) {
      await activate(
        page,
        page.getByRole("button", { name: "New deck" }).filter({ visible: true })
      );
    }

    await expect(box).toBeVisible({ timeout: 1000 });
  }).toPass(FIRST_PAINT);

  await box.fill(DESCRIBED_DECK.description);
  await box.press("Enter");

  await page.waitForURL(/\/m\/slides\/decks\/[^/?]+\?chat=/, FIRST_PAINT);

  const url = new URL(page.url());

  return { path: url.pathname, chatId: url.searchParams.get("chat") ?? "" };
}

/** Runs `body` under the ledger lock with no deck of the chat person before or after it. */
function withoutDecks(body: () => Promise<void>): Promise<void> {
  return withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await removeOwnDecks(SLIDES_PEOPLE.chat);

      try {
        await body();
      } finally {
        await removeOwnDecks(SLIDES_PEOPLE.chat);
      }
    },
    LOCK_WAIT
  );
}

test("a described deck opens at once, fills slide by slide, gets its name, and can be renamed in place", async ({
  page,
}) => {
  // Bugs caught: a start that waits for the whole run before the page opens, a panel that does not
  // show the description, a title that never leaves its loading state, a page that shows the deck
  // only at the end, and a toolbar that stays hidden after the run.
  test.setTimeout(LOCK_WAIT + 180_000);

  await withoutDecks(async () => {
    const { path } = await describeDeck(page);

    const panel = page.getByRole("region", { name: "Ask", exact: true });

    await expect(panel).toBeVisible(FIRST_PAINT);
    await expect(
      panel
        .getByRole("log", { name: "Conversation" })
        .getByText(DESCRIBED_DECK.description, { exact: true })
    ).toBeVisible(FIRST_PAINT);
    await expect(
      page.getByRole("heading", { level: 1, name: "Naming the deck" })
    ).toBeAttached();
    await expect(pill(page, /^Drafting slide \d+$/)).toBeVisible();
    // While the agent drafts, Stop is the page's one action; a phone shows no dock.
    await expect(
      onPhone(page)
        ? page.getByRole("toolbar", { name: "Slide tools" })
        : page.getByRole("button", { name: "Export to PowerPoint" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Stop", exact: true })
    ).toBeVisible();

    const seen = await countsUntil(() => slideButtons(page).count(), 3);

    expect(
      seen.some((count) => count > 0 && count < 3),
      `the deck showed ${JSON.stringify(seen)} slides on the way to 3`
    ).toBe(true);
    await expect(pill(page, "3 slides drafted")).toBeVisible(FIRST_PAINT);

    const rename = page.getByRole("button", {
      name: `Rename deck, ${DESCRIBED_DECK.title}`,
    });

    await expect(rename).toBeVisible();
    await expect(
      page
        .getByRole("button", { name: "Present", exact: true })
        .filter({ visible: true })
        .first()
    ).toBeVisible();
    await expectNoAxeViolations(page, "deck page after the draft");

    // Below 768 px Export and Rename deck are rows of the dock's More sheet (P13-7, P13-8), which
    // hides the page behind it, so Present and axe go first.
    const sheet = page.getByRole("dialog", { name: "Deck and slide actions" });

    if (onPhone(page)) {
      await activate(
        page,
        page
          .getByRole("toolbar", { name: "Slide tools" })
          .getByRole("button", { name: "More", exact: true })
      );
    }

    await expect(
      (onPhone(page) ? sheet : page).getByRole("button", {
        name: "Export to PowerPoint",
      })
    ).toBeVisible();

    await activate(
      page,
      onPhone(page)
        ? sheet.getByRole("button", { name: "Rename deck" })
        : rename
    );

    const input = page.getByRole("textbox", { name: "Deck title" });

    await input.fill("Collections review");
    await input.press("Enter");
    await expect(
      page.getByRole("button", { name: "Rename deck, Collections review" })
    ).toBeVisible(FIRST_PAINT);

    await page.goto("/m/slides/decks");
    // By its address: the fixed chat deck of `slides-change.ts` has the same title. A table from
    // 768 px and a list below it hold the same link.
    await expect(
      page.locator(`a[href$="${path}"]`).filter({ visible: true })
    ).toHaveText("Collections review", FIRST_PAINT);
    await expectNoAxeViolations(page, "Slides list after the rename");
  });
});

test("Stop while the deck drafts keeps the slides so far", async ({ page }) => {
  // Bug caught: Stop that does not end the run, removes the drafted slides, or leaves the pill on
  // "Drafting".
  test.setTimeout(LOCK_WAIT + 180_000);

  await withoutDecks(async () => {
    await describeDeck(page);

    await expect(slideButtons(page).first()).toBeVisible(FIRST_PAINT);
    await activate(
      page,
      page.getByRole("button", { name: "Stop", exact: true })
    );

    await expect(pill(page, /^Stopped, /)).toBeVisible(FIRST_PAINT);

    const kept = await slideButtons(page).count();

    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(3);
    await expect(pill(page, `Stopped, ${slideCount(kept)} kept`)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Stop", exact: true })
    ).toHaveCount(0);
  });
});

test("the draft goes on while the person is away, and the page follows it after a return and a reload", async ({
  page,
}) => {
  // Bugs caught: a run tied to the page that started it, and a page that follows the run only
  // through the panel.
  test.setTimeout(LOCK_WAIT + 180_000);

  await withoutDecks(async () => {
    // Ask compiles first, so the visit below fits inside the paced draft.
    await signInAs(page, SLIDES_PEOPLE.chat);
    await page.goto("/ask");
    await expect(
      page.getByRole("textbox", { name: "Message", exact: true })
    ).toBeVisible(FIRST_PAINT);

    const { path, chatId } = await describeDeck(page);

    await page.goto("/ask");

    if (onPhone(page)) {
      await activate(
        page,
        page
          .getByRole("button", { name: "Show chats" })
          .filter({ visible: true })
      );
    }

    const row = page
      .getByRole("navigation", { name: "Chats" })
      .getByRole("group", { name: "Slides chats" })
      .locator(`a[href$="?chat=${chatId}"]`);

    await expect(row.getByRole("img", { name: "Working" })).toBeVisible(
      FIRST_PAINT
    );
    await activate(page, row);

    await page.waitForURL(`**${path}?chat=${chatId}`, FIRST_PAINT);
    await expect(pill(page, /^Drafting slide \d+$/)).toBeVisible(FIRST_PAINT);

    // Without `?chat=`, so nothing opens the panel: the page reads the run on its own.
    await page.goto(path);
    await page.reload();

    await expect(pill(page, /^Drafting slide \d+$/)).toBeVisible(FIRST_PAINT);
    await expect(
      page.getByRole("button", { name: "Stop", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Ask", exact: true })
    ).toBeHidden();

    await countsUntil(() => slideButtons(page).count(), 3);
    await expect(pill(page, "3 slides drafted")).toBeVisible(FIRST_PAINT);
  });
});
