import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

import {
  SLIDES_CHANGE_DECK_ID,
  SLIDES_CHANGE_DECK_TITLE,
  SLIDES_CHANGE_MESSAGE,
  SLIDES_CHANGE_NEW_TITLE,
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
  removeOwnDecks,
  resetChangeDeck,
  slideOverflowFailures,
} from "./slides-support.ts";
import {
  closeSurfaceDatabase,
  handOverWholeDeck,
  openSurfaceAgent,
} from "./surface-support.ts";

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
 * The assembled Slides pages in `next dev` on the disposable demo database (Spec 7 AC-10). The
 * chat deck comes from the Ask handoff (R-42b); `agent-surfaces.spec.ts` checks the handoff itself.
 */

// The development widgets float over the chat's Send in development.
test.beforeEach(({ page }) => hideDevelopmentWidgets(page));

test.afterAll(async () => {
  await closeSlidesDatabase();
  await closeSurfaceDatabase();
});

/** A tap on the phone project, where a fixed bar or the Ask bubble may cover a control. */
async function activate(page: Page, target: Locator): Promise<void> {
  if (onPhone(page)) {
    await target.tap();

    return;
  }

  await target.click();
}

/** The task's evidence, at the viewport the project runs. */
async function screenshot(
  page: Page,
  testInfo: TestInfo,
  name: string
): Promise<void> {
  await page.screenshot({
    path: testInfo.outputPath(`slides-${name}-${testInfo.project.name}.png`),
    fullPage: true,
  });
}

const rail = (page: Page) => page.getByRole("navigation", { name: "Slides" });

const railButton = (page: Page, number: number) =>
  rail(page).getByRole("button", { name: new RegExp(`^Slide ${number}:`) });

/** The shown slide's canvas; the rail previews and present mode hold more of them. */
const deckCanvas = (page: Page) =>
  page.locator("main [data-shown-slide] [data-slide-canvas]");

test("the agent panel on the deck editor changes the shown slide, and Undo restores it", async ({
  page,
}, testInfo) => {
  test.setTimeout(LOCK_WAIT + 180_000);

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

        await activate(page, railButton(page, 2));
        await expect(railButton(page, 2)).toHaveAttribute(
          "aria-current",
          "true",
          { timeout: FIRST_PAINT.timeout }
        );

        const title = (text: string) =>
          deckCanvas(page).getByText(text, { exact: true });

        await expect(title(SLIDES_CHANGE_OLD_TITLE)).toBeVisible();

        const chat = await openSurfaceAgent(page, "Slides agent");

        // The page names the open deck and the shown slide (D21).
        await expect(
          chat.getByText(`About: ${SLIDES_CHANGE_DECK_TITLE}, slide 2`, {
            exact: true,
          })
        ).toBeVisible();

        await chat
          .getByRole("textbox", { name: "Message", exact: true })
          .fill(SLIDES_CHANGE_MESSAGE);

        const send = chat.getByRole("button", { name: "Send" });

        const answer = page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/agent") &&
            response.request().method() === "POST"
        );

        if (onPhone(page)) {
          await send.tap({ timeout: 15_000 });
          // The sheet covers the phone screen, so close it to see the slide; it keeps streaming.
          await chat
            .getByRole("button", { name: "Close the agent panel" })
            .tap();
        } else {
          await send.click({ timeout: 15_000 });
        }

        await (await answer).finished();

        // The page reads the deck again when the answer ends. 5 s stays under the 10 s poll of
        // `useDeck`, so a page that waits for the poll fails here.
        await expect(title(SLIDES_CHANGE_NEW_TITLE)).toBeVisible({
          timeout: 5000,
        });

        await expectNoAxeViolations(page, "deck editor after the chat change");
        await screenshot(page, testInfo, "change");

        await activate(page, page.getByRole("button", { name: "Undo" }));

        await expect(title(SLIDES_CHANGE_OLD_TITLE)).toBeVisible(FIRST_PAINT);
      } finally {
        await removeOwnDecks(SLIDES_PEOPLE.chat);
      }
    },
    LOCK_WAIT
  );
});

test("every slide of the chat deck fits at the viewport", async ({ page }) => {
  test.setTimeout(LOCK_WAIT + 180_000);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await removeOwnDecks(SLIDES_PEOPLE.chat);

      try {
        await handOverWholeDeck(page);

        const slide = deckCanvas(page);

        /* eslint-disable no-await-in-loop -- slides and their boxes are measured in turn. */
        for (let number = 1; number <= 5; number += 1) {
          await activate(page, railButton(page, number));
          // The canvas never unmounts, so the rail's current mark proves this slide is the one
          // now drawn before its boxes are measured.
          await expect(railButton(page, number)).toHaveAttribute(
            "aria-current",
            "true",
            { timeout: FIRST_PAINT.timeout }
          );

          expect(
            await slide.evaluate(slideOverflowFailures),
            `slide ${number} hides content`
          ).toEqual([]);
        }
        /* eslint-enable no-await-in-loop */

        // Present starts at the shown slide, so return to the first before presenting.
        await activate(page, railButton(page, 1));
        await activate(
          page,
          page.getByRole("button", { name: "Present", exact: true })
        );

        const present = page.locator(
          "[data-present-stage] [data-slide-canvas]"
        );

        const next = page.getByRole("button", { name: "Next slide" });

        const viewport = page.viewportSize();

        /* eslint-disable no-await-in-loop -- each slide is presented, then measured. */
        for (let number = 1; number <= 5; number += 1) {
          await expect(
            page.getByText(`${number} / 5`, { exact: true })
          ).toBeVisible(FIRST_PAINT);
          await expect(present).toBeVisible(FIRST_PAINT);

          const box = await present.boundingBox();

          if (box === null)
            throw new Error(`slide ${number} has no box in present mode.`);

          expect(
            box.x,
            `slide ${number} starts left of the viewport`
          ).toBeGreaterThanOrEqual(-0.5);
          expect(
            box.y,
            `slide ${number} starts above the viewport`
          ).toBeGreaterThanOrEqual(-0.5);
          expect(
            box.x + box.width,
            `slide ${number} ends right of the viewport`
          ).toBeLessThanOrEqual((viewport?.width ?? 0) + 0.5);
          expect(
            box.y + box.height,
            `slide ${number} ends below the viewport`
          ).toBeLessThanOrEqual((viewport?.height ?? 0) + 0.5);

          const button = await next.boundingBox();

          if (button === null)
            throw new Error("Next has no box in present mode.");

          const hit = await page.evaluate(
            ({ x, y }) =>
              document
                .elementFromPoint(x, y)
                ?.closest("button")
                ?.getAttribute("aria-label") ?? null,
            { x: button.x + button.width / 2, y: button.y + button.height / 2 }
          );

          expect(hit, `Next is covered on slide ${number}`).toBe("Next slide");

          if (number < 5) await activate(page, next);
        }
        /* eslint-enable no-await-in-loop */
      } finally {
        await removeOwnDecks(SLIDES_PEOPLE.chat);
      }
    },
    LOCK_WAIT
  );
});
