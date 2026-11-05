import { randomUUID } from "node:crypto";

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
import { seedChat, type SeededTurn } from "./chat-seed.ts";
import { ASK_PEOPLE, DEV_MODULES } from "./global-setup.ts";

test.skip(
  !DEV_MODULES.has("placeholder"),
  "The long chat recordings hold the default selection's tool list."
);

/**
 * A long chat (S7-34, `czjw.80`): past the 40-message window the route sends a stored summary and
 * the recent messages, and the chat says so with one quiet line. The model stand-in replays the
 * hand-written `long-chat-*` recordings, so the answer about turn 1 can only come from the summary.
 */

const LINE = "Earlier messages were summarized";

/** 20 turns: the first holds the fact, and the other 19 push it out of the old window. */
const TURNS: readonly SeededTurn[] = [
  {
    question: "Remember that the project code is Harbor.",
    answer: "I will remember that the project code is Harbor.",
  },
  ...Array.from({ length: 19 }, (_, index) => ({
    question: `What is note ${index + 2} about?`,
    answer: `Note ${index + 2} is about the plan for week ${index + 2}.`,
  })),
];

/** The summary that `long-chat-summary.json` answers. */
const RECORDED_SUMMARY =
  "The person asked the assistant to remember that the project code is Harbor. Then the person asked what notes 2 to 16 are about, and the assistant answered each one.";

const asker = (testInfo: TestInfo) =>
  testInfo.project.name === "phone" ? ASK_PEOPLE.phone : ASK_PEOPLE.desktop;

const widthOf = (testInfo: TestInfo) =>
  testInfo.project.name === "phone" ? 390 : 1440;

/** Whether `first` comes before `second` in the document. */
async function comesBefore(first: Locator, second: Locator): Promise<boolean> {
  const other = await second.elementHandle();

  return first.evaluate(
    (node, after) =>
      after !== null &&
      (node.compareDocumentPosition(after) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
        0,
    other
  );
}

/** One summary line, right after the answer of turn `turn` and before the next question. */
async function expectLineAfterTurn(
  scope: Page | Locator,
  turn: number
): Promise<Locator> {
  const line = scope.getByText(LINE, { exact: true });

  await expect(line).toHaveCount(1, FIRST_PAINT);
  expect(
    await comesBefore(
      scope.getByText(TURNS[turn - 1]?.answer ?? "", { exact: true }),
      line
    )
  ).toBe(true);
  expect(
    await comesBefore(
      line,
      scope.getByText(TURNS[turn]?.question ?? "", { exact: true })
    )
  ).toBe(true);

  return line;
}

test.beforeEach(({ page }) => hideDevelopmentWidgets(page));

test("a long chat sends a summary, says so once, and still answers about an early turn", async ({
  page,
}, testInfo) => {
  // A development server compiles the shell, Ask and the route on first use.
  test.setTimeout(180_000);

  const sessionId = randomUUID();

  await seedChat({ email: asker(testInfo), sessionId, turns: TURNS });
  await signInAs(page, asker(testInfo));

  // The shell posts on mount, so this response proves hydration before the question.
  const mounted = page.waitForResponse((response) =>
    response.url().endsWith("/api/session/activity")
  );

  await page.goto(`/ask/${sessionId}`);
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true })
  ).toBeVisible(FIRST_PAINT);
  await mounted;
  // The stored chat shows no line until a turn summarizes it.
  await expect(page.getByText(LINE, { exact: true })).toHaveCount(0);

  await askQuestion(page, "What is the project code?");
  await expect(
    page.getByText("The project code is Harbor.", { exact: true })
  ).toBeVisible(FIRST_PAINT);

  // Of the 41 messages the last 10 start at the answer of turn 16, so the kept part starts at the
  // question of turn 17, and the line sits after the answer of turn 16.
  const line = await expectLineAfterTurn(page, 16);

  await line.click();
  await expect(page.getByText(RECORDED_SUMMARY, { exact: true })).toBeVisible();
  await expectNoAxeViolations(page, "Ask with a summarized chat");
  await line.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath(
      `czjw.80-summary-line-${widthOf(testInfo)}-light.png`
    ),
  });

  // The stored chat draws the line from the session row, in the same place.
  await page.reload();
  await expectLineAfterTurn(page, 16);
});

test("the agent panel shows the summary line of a long chat", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);

  const sessionId = randomUUID();

  const summary =
    "The person asked the assistant to remember that the project code is Harbor, then asked about notes 2 to 15.";

  const { userId } = await seedChat({
    email: asker(testInfo),
    sessionId,
    turns: TURNS,
    summary: { text: summary, throughTurn: 15 },
  });

  // The panel keeps its chat for the tab under this key (`AGENT_PANEL_SESSION_KEY`).
  await page.addInitScript(([key, id]) => sessionStorage.setItem(key, id), [
    `genie.agent-panel.session:${userId}`,
    sessionId,
  ] as const);
  await signInAs(page, asker(testInfo));
  await page.goto("/account");

  const panel = await openAgentPanel(page);
  const line = await expectLineAfterTurn(panel, 15);

  await line.click();
  await expect(panel.getByText(summary, { exact: true })).toBeVisible();
  await expectNoAxeViolations(page, "The agent panel with a summarized chat");
});
