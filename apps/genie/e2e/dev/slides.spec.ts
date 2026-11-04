import { readFile } from "node:fs/promises";

import { readPptx } from "@genie/module-slides/testing";
import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

import {
  MONTHLY_DECK,
  SLIDES_CHAT_MESSAGE,
} from "../../testing/slides-chat.ts";
import { expectNoAxeViolations } from "../support/axe.ts";
import { withDeploymentLock } from "../support/lock.ts";
import {
  FIRST_PAINT,
  hideDevelopmentWidgets,
  openAgentPanel,
  signInAs,
} from "./ask-support.ts";
import { LEDGER_LOCK, LOCK_WAIT, onPhone, sgd } from "./dev-support.ts";
import { DEV_MODULES, SLIDES_PEOPLE } from "./global-setup.ts";
import {
  closeSlidesDatabase,
  removeOwnDecks,
  slideOverflowFailures,
} from "./slides-support.ts";

declare global {
  interface Window {
    /** Written before the chat change and read after the list refresh, so a reload cannot pass. */
    __genieMarker?: number;
  }
}

test.skip(
  !(
    DEV_MODULES.has("analytics") &&
    DEV_MODULES.has("invoices") &&
    DEV_MODULES.has("placeholder") &&
    DEV_MODULES.has("slides")
  ),
  "The slides chat recordings hold the default selection's tool list."
);

/** The assembled Slides pages in `next dev` on the disposable demo database (Spec 7 AC-10). */

// The development widgets float over the chat's Send in development.
test.beforeEach(({ page }) => hideDevelopmentWidgets(page));

test.afterAll(() => closeSlidesDatabase());

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

async function signInToList(page: Page): Promise<void> {
  await signInAs(page, SLIDES_PEOPLE.chat);
  await page.goto("/m/slides/decks");

  await expect(
    page.getByRole("heading", { level: 1, name: "Slides" })
  ).toBeVisible(FIRST_PAINT);
}

/**
 * Sends the recorded message in the page's chat, expects the deck in the list without a reload,
 * and opens it. The chat's second recorded answer makes the deck, so the message is sent once.
 */
async function createChatDeck(page: Page): Promise<void> {
  // The agent panel: a column beside the list from 1280 px, full height below (AG11).
  const chat = await openAgentPanel(page);

  // Before the chat change, so a reload of either the list or the deck page drops it.
  await page.evaluate(() => {
    // oxlint-disable-next-line no-underscore-dangle -- the marker this spec names.
    window.__genieMarker = 1;
  });

  await chat
    .getByRole("textbox", { name: "Message", exact: true })
    .fill(SLIDES_CHAT_MESSAGE);

  const send = chat.getByRole("button", { name: "Send" });

  if (onPhone(page)) {
    await send.tap({ timeout: 15_000 });
    // The chat covers the phone screen, so close it to see the list; it keeps streaming.
    await chat.getByRole("button", { name: "Close the agent panel" }).tap();
  } else {
    await send.click({ timeout: 15_000 });
  }

  const link = page.getByRole("link", {
    name: MONTHLY_DECK.title,
    exact: true,
  });

  await expect(link).toBeVisible(FIRST_PAINT);

  // oxlint-disable-next-line no-underscore-dangle -- the marker this spec names.
  expect(await page.evaluate(() => window.__genieMarker)).toBe(1);

  await activate(page, link);

  await expect(
    page.getByRole("heading", { level: 1, name: MONTHLY_DECK.title })
  ).toBeVisible(FIRST_PAINT);
}

test("a deck created by chat is presented and exports native charts", async ({
  page,
}, testInfo) => {
  test.setTimeout(LOCK_WAIT + 180_000);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await removeOwnDecks(SLIDES_PEOPLE.chat);

      try {
        await signInToList(page);
        await expectNoAxeViolations(page, "Slides list");
        await screenshot(page, testInfo, "list");

        await createChatDeck(page);

        await expect(
          rail(page).getByRole("button", { name: /^Slide \d+:/ })
        ).toHaveCount(5);

        // The deck the chat made puts the overdue table and the freeze date on slide 5.
        await activate(page, railButton(page, 5));

        const slide = deckCanvas(page);

        const overdue = slide.getByRole("figure", {
          name: "Overdue balance and oldest invoice by customer",
        });

        // Harbor Foods' overdue balance in `expected_baseline_answers.json`.
        await expect(
          overdue.getByText(sgd(12_600), { exact: true })
        ).toBeVisible(FIRST_PAINT);
        await expect(slide.locator("footer")).toContainText(
          "Figures as of 27 Oct 2026"
        );

        // A value the box cuts off still passes `toBeVisible`, so measure the box itself.
        const overflow = await slide
          .locator('[data-slide-box="table"]')
          .evaluate((element) => ({
            width: element.scrollWidth - element.clientWidth,
            height: element.scrollHeight - element.clientHeight,
          }));

        expect(
          overflow.width,
          "the overdue table is clipped across"
        ).toBeLessThanOrEqual(0);
        expect(
          overflow.height,
          "the overdue table is clipped down"
        ).toBeLessThanOrEqual(0);

        await expectNoAxeViolations(page, "Slides deck page");
        await screenshot(page, testInfo, "deck");

        // Present starts at the shown slide, so return to the first before presenting.
        await activate(page, railButton(page, 1));
        await activate(page, page.getByRole("button", { name: "Present" }));

        await expect(page.getByText("1 / 5", { exact: true })).toBeVisible(
          FIRST_PAINT
        );

        const next = page.getByRole("button", { name: "Next slide" });

        /* eslint-disable no-await-in-loop -- the deck moves one slide per press. */
        for (const number of [2, 3, 4, 5]) {
          await activate(page, next);
          await expect(
            page.getByText(`${number} / 5`, { exact: true })
          ).toBeVisible(FIRST_PAINT);
        }
        /* eslint-enable no-await-in-loop */

        // The axe wait lets the dialog's opening transition finish, so the shot is the steady state.
        await expectNoAxeViolations(page, "present mode");
        await screenshot(page, testInfo, "present");
        await activate(page, page.getByRole("button", { name: "Exit" }));

        await expect(page.getByRole("button", { name: "Present" })).toBeVisible(
          FIRST_PAINT
        );

        const downloading = page.waitForEvent("download", {
          timeout: FIRST_PAINT.timeout,
        });

        await activate(
          page,
          page.getByRole("button", { name: "Export to PowerPoint" })
        );

        const download = await downloading;
        const path = await download.path();

        if (path === null) throw new Error("the export download has no path.");

        const pptx = await readPptx(await readFile(path));

        expect(pptx.slideCount).toBe(5);
        // Three charts: the lines of slides 1 and 2, the bars of slide 3. The tables are text.
        // pptxgenjs numbers chart parts per server process, so a later export starts above chart1.
        expect(pptx.chartParts).toHaveLength(3);
        expect(await pptx.xmlOf(pptx.chartParts[0]!)).toContain(
          "<c:lineChart>"
        );
        expect(await pptx.xmlOf(pptx.chartParts[2]!)).toContain("<c:barChart>");
        expect(await pptx.xmlOf("ppt/slides/slide3.xml")).toContain(
          MONTHLY_DECK.slideTitles[2]
        );

        // An override that names a missing part is a deck PowerPoint refuses to open.
        const contentTypes = await pptx.xmlOf("[Content_Types].xml");

        const parts = [...contentTypes.matchAll(/PartName="([^"]+)"/g)].map(
          (match) => match[1]!.slice(1)
        );

        /* eslint-disable no-await-in-loop -- each part reads in turn from one zip. */
        for (const part of parts) {
          expect(
            await pptx.xmlOf(part),
            `[Content_Types].xml names a missing part ${part}`
          ).toBeTruthy();
        }
        /* eslint-enable no-await-in-loop */
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
        await signInToList(page);
        await createChatDeck(page);

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
        await activate(page, page.getByRole("button", { name: "Present" }));

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
