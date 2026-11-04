import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

import { expectNoAxeViolations } from "../support/axe.ts";
import {
  askQuestion,
  FIRST_PAINT,
  hideDevelopmentWidgets,
  openAgentPanel,
  signInAs,
} from "./ask-support.ts";
import { ASK_PEOPLE, DEV_MODULES } from "./global-setup.ts";

test.skip(
  !DEV_MODULES.has("placeholder"),
  "The model stand-in replays the placeholder's recordings."
);

/**
 * The agent panel, its step timeline, streaming with Stop, and artifacts with versions in `next dev`
 * with the model stand-in (Spec 7 R-42, R-45a, AC-8; I1, I18, I22). Each question is one that the
 * placeholder's recordings hold: `artifact-chart-*`, `artifact-change-*` and `stream-slow-1`.
 */

const CHART_QUESTION = "Chart the quantity of each placeholder record.";

const CHANGE_QUESTION = "Show it as a line by day instead.";

/** `stream-slow-1` answers it in three paragraphs, one event every 150 ms. */
const SLOW_QUESTION = "Describe each placeholder record.";

const FIRST_WORDS = "Placeholder records are fictional";

const THIRD_PARAGRAPH = "You can ask me to count the records";

/** The chart the first answer makes, and its title after the change. */
const CHART = "Quantity by record";

const CHANGED = "Quantity by day";

const onPhone = (testInfo: TestInfo) => testInfo.project.name === "phone";

/** Each project asks as its own person, so the two viewports never share a chat list. */
async function start(page: Page, testInfo: TestInfo, path: string) {
  // A development server compiles the shell, the route and the chart gate on first use.
  test.setTimeout(180_000);

  await signInAs(
    page,
    onPhone(testInfo) ? ASK_PEOPLE.phone : ASK_PEOPLE.desktop
  );
  await page.goto(path);
}

function viewportOf(page: Page) {
  const viewport = page.viewportSize();

  if (viewport === null) throw new Error("The project sets no viewport.");

  return viewport;
}

/** Expects the sheet `name` to cover the whole viewport, once it finished sliding in. */
async function expectFillsViewport(page: Page, name: string) {
  const sheet = page.getByRole("dialog", { name });
  const { width, height } = viewportOf(page);

  await expect(async () => {
    const box = await sheet.boundingBox();

    expect(box?.x).toBeCloseTo(0, 0);
    expect(box?.y).toBeCloseTo(0, 0);
    expect(box?.width).toBeCloseTo(width, 0);
    expect(box?.height).toBeCloseTo(height, 0);
  }).toPass({ timeout: 5000 });
}

const conversationOf = (scope: Page | Locator) =>
  scope.getByRole("log", { name: "Conversation" });

test.beforeEach(({ page }) => hideDevelopmentWidgets(page));

test("the Agent button opens the panel, which pushes the page on a desktop and fills a phone", async ({
  page,
}, testInfo) => {
  await start(page, testInfo, "/account");

  const content = page.getByRole("group", { name: "Page content" });

  await expect(content).toBeVisible(FIRST_PAINT);

  await openAgentPanel(page);

  if (onPhone(testInfo)) {
    await expectFillsViewport(page, "Agent");
  } else {
    // R-42: from 1280 px the panel is a 400 px column beside the page, never over it.
    const box = await content.boundingBox();

    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      viewportOf(page).width - 400
    );
  }

  await expectNoAxeViolations(page, "The open agent panel");
});

test("an answer streams word by word, and Stop keeps the words so far", async ({
  page,
}, testInfo) => {
  await start(page, testInfo, "/account");

  const panel = await openAgentPanel(page);
  const log = conversationOf(panel);
  const stop = panel.getByRole("button", { name: "Stop the answer" });

  await askQuestion(page, SLOW_QUESTION);

  // I18: the first words show while the model still answers.
  await expect(log.getByText(FIRST_WORDS)).toBeVisible(FIRST_PAINT);
  await expect(stop).toBeVisible();

  await stop.click();
  await expect(panel.getByRole("button", { name: "Send" })).toBeVisible();
  await expect(log.getByText(FIRST_WORDS)).toBeVisible();

  // The server stores what streamed up to Stop; a reload reads it back. It can hold a word or two
  // more than the screen showed, so the test checks the words seen and the missing end only.
  await expect(async () => {
    await page.reload();

    const reopened = conversationOf(await openAgentPanel(page));

    await expect(reopened.getByText(SLOW_QUESTION)).toBeVisible({
      timeout: 5000,
    });
    await expect(reopened.getByText(FIRST_WORDS)).toBeVisible({
      timeout: 5000,
    });
  }).toPass(FIRST_PAINT);

  await expect(page.getByText(THIRD_PARAGRAPH)).toHaveCount(0);
  await expectNoAxeViolations(page, "A stopped answer");
});

test("the timeline groups reads and folds one fixed step", async ({
  page,
}, testInfo) => {
  await start(page, testInfo, "/account");

  const panel = await openAgentPanel(page);

  await askQuestion(page, CHART_QUESTION);

  // Four tool calls: the list, two reads of one dataset, and a refused chart that was fixed.
  const strip = panel.getByRole("button", { name: /^Used 3 steps/ });
  const steps = panel.getByRole("list", { name: "Steps" });

  await expect(strip).toBeVisible(FIRST_PAINT);
  await expect(steps).toHaveCount(0);

  await strip.click();
  await expect(steps.getByText("Looked up the data")).toBeVisible();
  await expect(
    steps.getByRole("listitem").filter({ hasText: "Read Placeholder records" })
  ).toContainText("×2");
  await expect(steps.getByText("Made a chart, fixed 1 problem")).toBeVisible();
  await expectNoAxeViolations(page, "The open step timeline");

  await strip.click();
  await expect(steps).toHaveCount(0);
});

test("a change makes version 2, the panel steps back to version 1, and a phone opens the artifact as a sheet", async ({
  page,
}, testInfo) => {
  await start(page, testInfo, "/ask");

  const log = conversationOf(page);
  const sessionId = await askQuestion(page, CHART_QUESTION);

  // The first answer moves Ask to the chat's address, which draws the chat again, so the next
  // question waits for that and for the stored card.
  await expect(page).toHaveURL(`/ask/${sessionId}`, FIRST_PAINT);
  await expect(log.getByRole("button", { name: CHART })).toBeEnabled(
    FIRST_PAINT
  );

  await askQuestion(page, CHANGE_QUESTION);

  const second = log.getByRole("button", { name: CHANGED });

  await expect(second).toContainText("Chart · v2", FIRST_PAINT);
  await expect(second).toBeEnabled(FIRST_PAINT);
  await second.click();

  const artifact = page.getByRole("region", { name: "Artifact", exact: true });

  // The chat's artifacts load again when the answer ends, so version 2 can show a moment later.
  await expect(artifact.getByText("Version 2 of 2")).toBeVisible(FIRST_PAINT);
  await artifact.getByRole("button", { name: "Previous version" }).click();
  await expect(artifact.getByText("Version 1 of 2")).toBeVisible();

  if (onPhone(testInfo)) {
    await expectFillsViewport(page, "Artifact");
    await expectNoAxeViolations(page, "The artifact sheet");
    await artifact.getByRole("button", { name: "Back to the chat" }).click();
    await expect(artifact).toBeHidden();
  } else {
    // AG22: from 1280 px the artifact is a column beside the conversation.
    const chat = await page
      .getByRole("region", { name: "Conversation" })
      .boundingBox();

    const column = await artifact.boundingBox();

    expect((chat?.x ?? 0) + (chat?.width ?? 0)).toBeLessThanOrEqual(
      column?.x ?? 0
    );
    await expectNoAxeViolations(page, "Ask with the artifact column");
  }
});

test("Open in Ask continues the panel's chat, with its artifact", async ({
  page,
}, testInfo) => {
  await start(page, testInfo, "/account");

  const panel = await openAgentPanel(page);
  const sessionId = await askQuestion(page, CHART_QUESTION);

  await expect(panel.getByRole("link", { name: CHART })).toBeVisible(
    FIRST_PAINT
  );

  // I1: once the answer is stored, Open in Ask names this chat.
  const openInAsk = panel.getByRole("link", {
    name: "Open in Ask",
    exact: true,
  });

  await expect(openInAsk).toHaveAttribute("href", `/ask/${sessionId}`);
  await openInAsk.click();
  await expect(page).toHaveURL(`/ask/${sessionId}`, FIRST_PAINT);
  await expect(
    conversationOf(page).getByText(CHART_QUESTION, { exact: true })
  ).toBeVisible(FIRST_PAINT);

  // The panel keeps the tab's chat, so its card links to the artifact in Ask.
  await page.goto("/account");
  await (await openAgentPanel(page)).getByRole("link", { name: CHART }).click();
  await expect(page).toHaveURL(
    new RegExp(`/ask/${sessionId}\\?artifact=`),
    FIRST_PAINT
  );
  await expect(
    page
      .getByRole("region", { name: "Artifact", exact: true })
      .getByText("Version 1 of 1")
  ).toBeVisible(FIRST_PAINT);
  await expectNoAxeViolations(page, "Ask opened on the panel's artifact");
});
