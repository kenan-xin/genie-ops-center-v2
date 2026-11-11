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
  type DeckContent,
  openStyleTool,
  removeOwnDecks,
  resetChangeDeck,
  undoLengthOf,
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

/** Runs one case on the fixed deck (or `content` in its place), signed in as the chat person, under the ledger lock. */
async function onFixedDeck(
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

test("a press inside a corner handle's touch area resizes the element", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 120_000);

  await onFixedDeck(page, async () => {
    // The 44 px area is the pointer-coarse one; without a coarse pointer the phone proves nothing.
    expect(
      await page.evaluate(() => matchMedia("(pointer: coarse)").matches)
    ).toBe(onPhone(page));

    const text = textElement(page);

    await activate(page, text);

    const handle = page.locator('[data-stage-element="1"] [data-handle="se"]');

    await handle.scrollIntoViewIfNeeded();

    const start = await text.boundingBox();
    const corner = await handle.boundingBox();

    if (start === null || corner === null) {
      throw new Error("the text or its handle has no box");
    }

    // Inside the text, outside the 12 px square, inside the 44 px (coarse) or 28 px (fine) area.
    const inset = onPhone(page) ? 18 : 10;

    const p = {
      x: corner.x + corner.width / 2 - inset,
      y: corner.y + corner.height / 2 - inset,
    };

    expect(
      await page.evaluate(
        ({ x, y }) =>
          document.elementFromPoint(x, y)?.getAttribute("data-handle"),
        p
      )
    ).toBe("se");

    if (onPhone(page)) {
      const cdp = await page.context().newCDPSession(page);

      const touch = (
        type: "touchStart" | "touchMove" | "touchEnd",
        points: { x: number; y: number }[]
      ) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });

      await touch("touchStart", [p]);
      await touch("touchMove", [{ x: p.x - 20, y: p.y - 10 }]);
      await touch("touchMove", [{ x: p.x - 40, y: p.y - 20 }]);
      await touch("touchEnd", []);
    } else {
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(p.x - 40, p.y - 20, { steps: 6 });
      await page.mouse.up();
    }

    await expect
      .poll(async () => (await text.boundingBox())?.width, FIRST_PAINT)
      .toBeLessThan(start.width - 10);
    expect(
      Math.abs(((await text.boundingBox())?.x ?? Infinity) - start.x)
    ).toBeLessThanOrEqual(1);
    await expect(undoButton(page)).toBeEnabled(FIRST_PAINT);
  });
});

test("arrow presses on the title and then the text within 800 ms move each one", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 120_000);

  await onFixedDeck(page, async () => {
    const title = page.getByRole("button", {
      name: /^Title "Collections are on track for/,
    });

    const text = textElement(page);
    const titleStart = await title.boundingBox();
    const textStart = await text.boundingBox();

    if (titleStart === null || textStart === null) {
      throw new Error("the title or the text has no box");
    }

    await title.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Tab");
    await expect(text).toBeFocused();
    await page.keyboard.press("ArrowDown");

    // The stored row is the proof: an Undo press could land while the text's run still waits.
    await expect
      .poll(() => undoLengthOf(SLIDES_CHANGE_DECK_ID), FIRST_PAINT)
      .toBe(2);

    // One preview (P16-2): the title shows its saved box only after the page reads the deck again.
    await expect
      .poll(async () => (await title.boundingBox())?.x, FIRST_PAINT)
      .toBeGreaterThan(titleStart.x + 1);
    await expect
      .poll(async () => (await text.boundingBox())?.y, FIRST_PAINT)
      .toBeGreaterThan(textStart.y + 1);
    await expect
      .poll(
        async () =>
          Math.abs(((await text.boundingBox())?.x ?? Infinity) - textStart.x),
        FIRST_PAINT
      )
      .toBeLessThanOrEqual(1);
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
    await openStyleTool(page, "Text");

    // The phone's Text card shows the color panel itself.
    if (!onPhone(page)) {
      await activate(page, page.getByRole("button", { name: "Text color" }));
    }

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

/** One dark slide whose bullets carry a box and a white color (czjw.128). */
const STYLED_BULLETS_DECK: DeckContent = {
  slides: [
    {
      id: "s1",
      background: "#1E3A8A",
      elements: [
        {
          kind: "title",
          text: "Collections are on track for October.",
          style: { color: "#FFFFFF" },
        },
        {
          kind: "bullets",
          items: ["Call each customer", "Send the statement"],
          box: { x: 40, y: 136, w: 440, h: 300 },
          style: { color: "#FFFFFF", fontSize: 24 },
        },
      ],
    },
  ],
};

test("a bullet edit on a dark slide keeps the list's box and color", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 120_000);

  await onFixedDeck(
    page,
    async () => {
      const bullets = page.getByRole("button", {
        name: /^Bullets "Call each customer"/,
      });

      await activate(page, bullets);

      const kept = await bullets.boundingBox();

      await openStyleTool(page, "More");
      await activate(page, page.getByRole("button", { name: "Edit text" }));

      const sheet = page.getByRole("dialog", { name: "Edit slide" });

      await activate(page, sheet.getByRole("button", { name: "Add bullet" }));
      await sheet
        .getByRole("textbox", { name: "Bullet 3" })
        .fill("Close the account");
      await activate(
        page,
        sheet.getByRole("button", { name: "Remove bullet 1" })
      );
      await activate(page, sheet.getByRole("button", { name: "Save slide" }));

      await expect(undoButton(page)).toBeEnabled(FIRST_PAINT);
      await expect(page.getByText(/was not changed/)).toHaveCount(0);
      await expect(deckCanvas(page).getByText("Close the account")).toHaveCSS(
        "color",
        "rgb(255, 255, 255)"
      );

      const moved = await page
        .getByRole("button", { name: /^Bullets "Send the statement"/ })
        .boundingBox();

      if (kept === null || moved === null) {
        throw new Error("the bullets have no box");
      }

      expect(Math.abs(moved.x - kept.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(moved.y - kept.y)).toBeLessThanOrEqual(1);
    },
    STYLED_BULLETS_DECK
  );
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

/** One slide whose text ends at the slide's right edge, where a corner handle's touch area is widest (P16e-59). */
const RIGHT_EDGE_DECK: DeckContent = {
  slides: [
    {
      id: "s1",
      elements: [
        { kind: "title", text: "Collections are on track for October." },
        {
          kind: "text",
          text: "Every figure comes from the linked payments.",
          box: { x: 640, y: 136, w: 320, h: 96 },
        },
      ],
    },
  ],
};

test("on a phone the one-row dock edits the text, Present stays in the top bar, and the page keeps its width", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "phone",
    "The dock and the top bar's Present show below 768 px only."
  );
  test.setTimeout(LOCK_WAIT + 120_000);

  await onFixedDeck(
    page,
    async () => {
      const text = textElement(page);

      await activate(page, text);

      const dock = page.getByRole("toolbar", { name: /style$/ });

      await expect(dock).toBeVisible();
      // Inside the shell the page scrolls in its content area, never the document.
      expect(
        await page.evaluate(() => {
          const area = document.querySelector("[data-shell-content]");

          return [
            document.documentElement.scrollWidth - window.innerWidth,
            area === null ? -1 : area.scrollWidth - area.clientWidth,
          ];
        })
      ).toEqual([0, 0]);

      const tools = await Promise.all(
        ["Text", "Fill", "Border", "Position", "More"].map((name) =>
          dock.getByRole("button", { name, exact: true }).boundingBox()
        )
      );

      const width = page.viewportSize()?.width ?? 0;

      for (const tool of tools) {
        expect(tool?.y).toBeCloseTo(tools[0]?.y ?? -1, 0);
        expect(
          (tool?.x ?? -1) >= 0 && (tool?.x ?? 0) + (tool?.width ?? 0) <= width
        ).toBe(true);
      }

      const start = await text.boundingBox();

      await openStyleTool(page, "Position");
      await activate(page, page.getByRole("button", { name: "Move left" }));

      const topBar = page.locator("[data-page-top-bar]");

      await expect(topBar.getByRole("button", { name: "Undo" })).toBeEnabled(
        FIRST_PAINT
      );
      await expect
        .poll(async () => (await text.boundingBox())?.x, FIRST_PAINT)
        .toBeLessThan((start?.x ?? 0) - 1);

      const present = topBar.getByRole("button", {
        name: "Present",
        exact: true,
      });

      await page.keyboard.press("Escape");
      await expect(dock).toBeVisible();
      await expect(present).toBeVisible();
      await activate(page, present);
      await expect(
        page.locator("[data-present-stage] [data-slide-canvas]")
      ).toBeVisible(FIRST_PAINT);
    },
    RIGHT_EDGE_DECK
  );
});

test("a background pick that recolors text says so, and its Undo brings the colors back", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 120_000);

  await onFixedDeck(page, async () => {
    const colorOf = (text: string) =>
      deckCanvas(page)
        .getByText(text)
        .evaluate((element) => getComputedStyle(element).color);

    const title = "Collections are on track for October.";
    const body = "Every figure comes from the linked payments.";

    const colors = async () => [
      await backgroundOf(page),
      await colorOf(title),
      await colorOf(body),
    ];

    const before = await colors();

    await activate(
      page,
      page.getByRole("button", { name: "Background", exact: true })
    );
    await activate(
      page,
      page.getByRole("button", { name: "Dark blue #1E3A8A" })
    );

    const note = page
      .getByRole("status")
      .filter({ hasText: "Text colors changed to stay readable." });

    await expect(note).toBeVisible(FIRST_PAINT);
    await expect.poll(() => backgroundOf(page)).toBe(DARK_BLUE);
    expect(await colorOf(title)).not.toBe(before[1]);

    await activate(page, note.getByRole("button", { name: "Undo" }));
    await expect(note).toHaveCount(0, FIRST_PAINT);
    await expect.poll(colors, FIRST_PAINT).toEqual(before);
    await expect(undoButton(page)).toBeDisabled();
  });
});
