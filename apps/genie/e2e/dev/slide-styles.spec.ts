import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  SLIDES_CHANGE_DECK_ID,
  SLIDES_CHANGE_DECK_TITLE,
  SLIDES_OUT_OF_TOOLS_ANSWER,
  SLIDES_OUT_OF_TOOLS_MESSAGE,
  SLIDES_STYLE_MESSAGE,
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
} from "./slides-support.ts";
import { closeSurfaceDatabase, openSurfaceAgent } from "./surface-support.ts";

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
 * Position and style per slide element (S7-43, AC-14) and the deck agent's answer outside its
 * tools (S7-44, R-46a), on the fixed deck of `slides-change.ts`, which opens on its title slide.
 */

test.beforeEach(({ page }) => hideDevelopmentWidgets(page));

test.afterAll(async () => {
  await closeSlidesDatabase();
  await closeSurfaceDatabase();
});

const DARK_BLUE = "rgb(30, 58, 138)";

const deckCanvas = (page: Page) =>
  page.locator("main [data-shown-slide] [data-slide-canvas]");

const undoButton = (page: Page) => page.getByRole("button", { name: "Undo" });

const textElement = (page: Page) =>
  page.getByRole("button", { name: /^Text "Every figure/ });

async function activate(page: Page, target: Locator): Promise<void> {
  if (onPhone(page)) {
    await target.tap();

    return;
  }

  await target.click();
}

/** Runs one case on the fixed deck, signed in as the chat person, under the ledger lock. */
async function onFixedDeck(
  page: Page,
  run: () => Promise<void>
): Promise<void> {
  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await resetChangeDeck(SLIDES_PEOPLE.chat);

      try {
        await signInAs(page, SLIDES_PEOPLE.chat);
        await page.goto(`/m/slides/decks/${SLIDES_CHANGE_DECK_ID}`);
        await expect(
          page.getByRole("heading", {
            level: 1,
            name: SLIDES_CHANGE_DECK_TITLE,
          })
        ).toBeVisible(FIRST_PAINT);
        // The page settles before the first press: on a phone a shift after hydration moves the
        // slide under the press point (P03-15).
        await page.waitForLoadState("networkidle");
        await run();
      } finally {
        await removeOwnDecks(SLIDES_PEOPLE.chat);
      }
    },
    LOCK_WAIT
  );
}

/** Sends one message to the Slides agent and waits for its answer to end. */
async function sendToSlidesAgent(page: Page, text: string): Promise<Locator> {
  const chat = await openSurfaceAgent(page, "Slides agent");

  await chat.getByRole("textbox", { name: "Message", exact: true }).fill(text);

  const answer = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/agent") &&
      response.request().method() === "POST"
  );

  await activate(page, chat.getByRole("button", { name: "Send" }));
  await (await answer).finished();

  return chat;
}

const backgroundOf = (page: Page) =>
  deckCanvas(page).evaluate(
    (element) => getComputedStyle(element).backgroundColor
  );

/** Presses at the target's center, moves by dx, dy in screen pixels, and lets go. */
async function dragBy(page: Page, target: Locator, dx: number, dy: number) {
  await target.scrollIntoViewIfNeeded();

  const box = await target.boundingBox();

  if (box === null) throw new Error("the drag target has no box");

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}

test("a chat request makes the title slide dark blue with white text, and Undo reverses it", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 180_000);

  await onFixedDeck(page, async () => {
    await expect.poll(() => backgroundOf(page)).not.toBe(DARK_BLUE);

    const chat = await sendToSlidesAgent(page, SLIDES_STYLE_MESSAGE);

    if (onPhone(page)) {
      await chat.getByRole("button", { name: "Close the agent panel" }).tap();
    }

    // The page reads the deck again when the answer ends, under the 10 s poll.
    await expect
      .poll(() => backgroundOf(page), { timeout: 5000 })
      .toBe(DARK_BLUE);
    await expect(
      deckCanvas(page).getByText("Collections are on track for October.")
    ).toHaveCSS("color", "rgb(255, 255, 255)");
    await expectNoAxeViolations(page, "deck editor after the style change");

    await activate(page, undoButton(page));
    await expect
      .poll(() => backgroundOf(page), FIRST_PAINT)
      .not.toBe(DARK_BLUE);
  });
});

test("a drag and a resize each make one Undo entry", async ({ page }) => {
  test.setTimeout(LOCK_WAIT + 120_000);

  await onFixedDeck(page, async () => {
    const text = textElement(page);
    const start = await text.boundingBox();

    await expect(undoButton(page)).toBeDisabled();

    await dragBy(page, text, 60, 30);
    await expect(undoButton(page)).toBeEnabled(FIRST_PAINT);

    const moved = await text.boundingBox();

    // The text spans 880 of 960 units, so it can move 40 at most: a few pixels on a phone.
    expect(moved?.x).toBeGreaterThan((start?.x ?? 0) + 2);

    await dragBy(
      page,
      page.locator('[data-stage-element="1"] [data-handle="se"]'),
      -40,
      -20
    );
    await expect
      .poll(async () => (await text.boundingBox())?.width, FIRST_PAINT)
      .toBeLessThan((moved?.width ?? 0) - 10);

    // Two gestures, two entries: the first Undo keeps one, the second empties the stack.
    await activate(page, undoButton(page));
    await expect
      .poll(async () => (await text.boundingBox())?.width, FIRST_PAINT)
      .toBeCloseTo(moved?.width ?? 0, 0);
    await expect(undoButton(page)).toBeEnabled();

    await activate(page, undoButton(page));
    await expect
      .poll(async () => (await text.boundingBox())?.x, FIRST_PAINT)
      .toBeCloseTo(start?.x ?? 0, 0);
    await expect(undoButton(page)).toBeDisabled();
  });
});

test("a text color below the contrast limit is refused, names the element and saves nothing", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 120_000);

  await onFixedDeck(page, async () => {
    await activate(
      page,
      page.getByRole("button", { name: /^Title "Collections are on track for/ })
    );
    await activate(page, page.getByRole("button", { name: "Text color" }));
    await page.getByRole("textbox", { name: "Hex" }).fill("#F3F4F6");
    await activate(page, page.getByRole("button", { name: "Apply" }));

    await expect(
      page.getByText(
        /Title "Collections are on track for…": #F3F4F6 on the theme background #FFFFFF is 1\.1:1/
      )
    ).toBeVisible(FIRST_PAINT);
    await expect(undoButton(page)).toBeDisabled();
  });
});

test("a request outside the deck tools gets one sentence of what the agent can change", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 180_000);

  await onFixedDeck(page, async () => {
    const chat = await sendToSlidesAgent(page, SLIDES_OUT_OF_TOOLS_MESSAGE);

    await expect(chat.getByText(SLIDES_OUT_OF_TOOLS_ANSWER)).toBeVisible(
      FIRST_PAINT
    );
    await expect(undoButton(page)).toBeDisabled();
  });
});
