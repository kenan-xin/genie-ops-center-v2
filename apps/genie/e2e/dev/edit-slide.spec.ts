import { expect, test, type Locator, type Page } from "@playwright/test";
import { escapeRegExp } from "es-toolkit";

import {
  EDIT_SLIDE_CONTENT,
  SLIDES_CHANGE_DECK_ID,
} from "../../testing/slides-change.ts";
import { withDeploymentLock } from "../support/lock.ts";
import {
  askPanel,
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
  "The Edit slide sheet lives on the Slides module's deck page."
);

/**
 * The Edit slide sheet in each of its states and the Add element menu (czjw.180), and the starter
 * question that Chart sends to Ask (czjw.189), at a phone and a desktop.
 */

// An action on a part that a bug removed or keeps busy would otherwise wait out the whole test
// while it holds the ledger lock (14 minutes in a planted run), so each action gives up sooner.
test.use({ actionTimeout: 60_000 });

test.beforeEach(({ page }) => hideDevelopmentWidgets(page));

test.afterAll(closeSlidesDatabase);

/** The starter of Chart on slide 1, answered by the synthetic `synthetic-slides-add-chart-1`. */
const CHART_STARTER = "Which chart can I add to slide 1?";

const CHART_ANSWER =
  "Which chart do you want on slide 1? I can chart the monthly collections from Payments or the overdue invoices by customer from Invoices.";

const VISUAL_RULE =
  "A slide holds at most two figures, charts, tables or images.";

/** A 1×1 opaque PNG. */
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c63e02fcbfb0f00037e01f3a9df61700000000049454e44ae426082",
  "hex"
);

async function activate(page: Page, target: Locator): Promise<void> {
  if (onPhone(page)) {
    await target.tap();

    return;
  }

  await target.click();
}

/** Opens the fixed deck (or `content` in its place) as the chat person, under the ledger lock. */
async function onDeck(
  page: Page,
  run: () => Promise<void>,
  content?: DeckContent
): Promise<void> {
  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await resetChangeDeck(SLIDES_PEOPLE.chat, content);

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

async function showSlide(page: Page, number: number): Promise<void> {
  await activate(
    page,
    page.getByRole("button", { name: new RegExp(`^Slide ${number}: `) })
  );
}

/** Opens Edit slide for slide `number`: the dock tool on a phone, the tile menu on a desktop. */
async function openSheet(page: Page, number: number): Promise<Locator> {
  await showSlide(page, number);

  if (onPhone(page)) {
    await activate(
      page,
      slideTools(page).getByRole("button", { name: "Edit slide" })
    );
  } else {
    await activate(
      page,
      page.getByRole("button", { name: `Actions for slide ${number}` })
    );
    await activate(page, page.getByRole("menuitem", { name: "Edit slide" }));
  }

  const sheet = page.getByRole("dialog", { name: `Edit slide ${number}` });

  await expect(sheet).toBeVisible();

  return sheet;
}

async function cancel(page: Page, sheet: Locator): Promise<void> {
  await activate(page, sheet.getByRole("button", { name: "Cancel" }));
  await expect(sheet).toBeHidden();
}

/** Add element: a tool of the Slide tools dock on a phone, a button above the slide on a desktop. */
async function openAddElement(page: Page): Promise<Locator> {
  const trigger = onPhone(page)
    ? slideTools(page).getByRole("button", { name: "Add element" })
    : page.getByRole("button", { name: "Add element" });

  await activate(page, trigger);

  const menu = page.getByRole("menu");

  await expect(menu).toBeVisible();

  return menu;
}

test("each state of the Edit slide sheet shows its parts", async ({ page }) => {
  test.setTimeout(LOCK_WAIT + 240_000);

  await onDeck(
    page,
    async () => {
      // Full: two figures leave no room for an image, and Add image says the slide rule.
      let sheet = await openSheet(page, 2);
      const addImage = sheet.getByRole("button", { name: "Add image" });

      await expect
        .soft(sheet.getByText("2 of 2", { exact: true }))
        .toBeVisible();
      await expect.soft(addImage).toBeDisabled();
      await expect.soft(addImage).toHaveAccessibleDescription(VISUAL_RULE);
      await cancel(page, sheet);

      // Bullets: the count against the limit, and Use text joins them into one text.
      sheet = await openSheet(page, 3);
      await expect
        .soft(sheet.getByText("3 of 5", { exact: true }))
        .toBeVisible();
      await activate(page, sheet.getByRole("button", { name: "Use text" }));
      await expect
        .soft(sheet.getByRole("textbox", { name: "Text", exact: true }))
        .toHaveValue("Send the statements Call each customer Post the cash");
      await cancel(page, sheet);

      // No text: both ways to add one, and Add text gives the text field.
      sheet = await openSheet(page, 4);
      await expect
        .soft(sheet.getByRole("button", { name: "Add bullets" }))
        .toBeEnabled();
      await activate(page, sheet.getByRole("button", { name: "Add text" }));
      await expect
        .soft(sheet.getByRole("textbox", { name: "Text", exact: true }))
        .toBeVisible();
      await cancel(page, sheet);

      // Image: an uploaded image saves only with its alt text, and the first Save says so.
      const saves: string[] = [];

      page.on("request", (request) => {
        if (request.url().endsWith("/slides/changeDeck")) {
          saves.push(request.postData() ?? "");
        }
      });
      sheet = await openSheet(page, 5);

      const chooser = page.waitForEvent("filechooser");

      await activate(page, sheet.getByRole("button", { name: "Add image" }));
      await (
        await chooser
      ).setFiles({ name: "team.png", mimeType: "image/png", buffer: PNG });
      await expect(sheet.getByText("Image · PNG or JPEG")).toBeVisible(
        FIRST_PAINT
      );
      await activate(page, sheet.getByRole("button", { name: "Save slide" }));

      const alt = sheet.getByRole("textbox", { name: "Alt text" });

      await expect
        .soft(sheet.getByText("Add alt text for this image."))
        .toBeVisible();
      await expect.soft(alt).toHaveAttribute("aria-invalid", "true");
      expect.soft(saves).toEqual([]);
      await alt.fill("The finance team");
      await activate(page, sheet.getByRole("button", { name: "Save slide" }));
      await expect(sheet).toBeHidden(FIRST_PAINT);
      expect.soft(saves).toHaveLength(1);
      expect.soft(saves[0]).toContain('"alt":"The finance team"');
      await expect
        .soft(
          page
            .locator("main [data-shown-slide] [data-slide-canvas]")
            .getByRole("img", { name: "The finance team" })
        )
        .toBeVisible();

      // Chart: the figure's row with its kind and source, the count, and the note that opens Ask.
      sheet = await openSheet(page, 1);
      await expect
        .soft(
          sheet
            .getByRole("list", { name: "Charts and images" })
            .getByRole("listitem")
        )
        .toHaveText([/^Collections\s*Figure · from Payments/]);
      await expect
        .soft(sheet.getByText("1 of 2", { exact: true }))
        .toBeVisible();
      await activate(page, sheet.getByRole("button", { name: "open Ask" }));
      await expect(sheet).toBeHidden();
      await expect.soft(askPanel(page)).toBeVisible();
    },
    EDIT_SLIDE_CONTENT
  );
});

test("Add element lists six items, and a full slide turns off the four visual ones", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 120_000);

  await onDeck(
    page,
    async () => {
      await showSlide(page, 2);

      const menu = await openAddElement(page);

      await expect.soft(menu.getByRole("menuitem")).toHaveCount(6);
      await expect.soft(menu).toMatchAriaSnapshot(`
        - menu:
          - menuitem "Text"
          - menuitem "Bullets"
          - menuitem "Figure" [disabled]
          - menuitem "Chart" [disabled]
          - menuitem "Table" [disabled]
          - menuitem "Image" [disabled]
      `);

      await Promise.all(
        ["Figure", "Chart", "Table", "Image"].map((name) =>
          expect
            .soft(menu.getByRole("menuitem", { name, exact: true }))
            .toHaveAccessibleDescription(VISUAL_RULE)
        )
      );
    },
    EDIT_SLIDE_CONTENT
  );
});

test("Chart on slide 1 asks Ask which chart to add, and Ask answers", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 180_000);

  await onDeck(page, async () => {
    const menu = await openAddElement(page);

    await activate(page, menu.getByRole("menuitem", { name: "Chart" }));

    // The starter shows as the person's message, then its answer, in the deck's Slides chat.
    await expect(
      askPanel(page).getByRole("log", { name: "Conversation" })
    ).toHaveText(
      new RegExp(
        `^You: ${escapeRegExp(CHART_STARTER)}\\s*Answer:\\s*${escapeRegExp(CHART_ANSWER)}`
      ),
      FIRST_PAINT
    );
  });
});
