import { randomUUID } from "node:crypto";

import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

import { expectNoAxeViolations } from "../support/axe.ts";
import { atLg, openNavigation } from "../support/shell.ts";
import {
  askQuestion,
  devSession,
  FIRST_PAINT,
  hideDevelopmentWidgets,
  openAgentPanel,
  openUntilVisible,
  PUBLIC_URL,
  signInAs as signIn,
} from "./ask-support.ts";
import { ASK_PEOPLE, DEV_MODULES } from "./global-setup.ts";

test.skip(
  !DEV_MODULES.has("placeholder"),
  "The model stand-in replays the placeholder's recordings."
);

/**
 * Ask and the agent panel in `next dev` with the model stand-in (Spec 7 AC-8 line 4, R-42, P13).
 * The stand-in replays the placeholder's recordings, so every question here is exactly the one
 * they hold, and the count of 3 comes from the module's count tool over the three seeded records.
 */

const QUESTION = "How many placeholder records are there?";

/** The artifact conversation of `artifact-chart-*` and `artifact-change-*`. */
const CHART_QUESTION = "Chart the quantity of each placeholder record.";

const CHANGE_QUESTION = "Show it as a line by day instead.";

/** The answer's first sentence, as `agent-route.integration.test.ts` pins it (S1_ANSWER). */
const answerOf = (scope: Page | Locator) =>
  scope.getByText("There are 3 placeholder records.", { exact: true });

/** Each project asks as its own person, so the two viewports never share a session list. */
const asker = (testInfo: TestInfo) =>
  testInfo.project.name === "phone" ? ASK_PEOPLE.phone : ASK_PEOPLE.desktop;

/** Asks the question in an open conversation and answers the session id the browser sent. */
const ask = (page: Page) => askQuestion(page, QUESTION);

/** The count answer. */
async function expectAnswer(page: Page): Promise<void> {
  await expect(answerOf(page)).toBeVisible(FIRST_PAINT);
}

/** Ask's chat history: a column from 1024 px, and below that a sheet that "Show chats" opens. */
async function historyOf(page: Page): Promise<Locator> {
  if (atLg(page))
    return page.getByRole("complementary", { name: "Chat history" });

  const sheet = page.getByRole("dialog", { name: "Chats" });

  await openUntilVisible(
    page.getByRole("button", { name: "Show chats" }),
    sheet
  );

  return sheet;
}

const agentButton = (page: Page) =>
  page.getByRole("button", { name: "Agent", exact: true });

test.beforeEach(({ page }) => hideDevelopmentWidgets(page));

test("the agent panel and Ask share a chat, and only New chat starts another", async ({
  page,
}, testInfo) => {
  // A development server compiles the shell, Ask, the route and the chart gate on first use.
  test.setTimeout(180_000);

  await signIn(page, asker(testInfo));
  await page.goto("/account");

  const panel = await openAgentPanel(page);
  const sessionId = await ask(page);

  await expectAnswer(page);
  await expectNoAxeViolations(page, "The open agent panel");

  // czjw.60: on the same page, opening again continues the chat, and only New chat starts one.
  await panel.getByRole("button", { name: "Close the agent panel" }).click();
  await expect(panel).toBeHidden();

  const reopened = await openAgentPanel(page);

  await expect(
    reopened
      .getByRole("log", { name: "Conversation" })
      .getByText(QUESTION, { exact: true })
  ).toBeVisible(FIRST_PAINT);

  await reopened.getByRole("button", { name: "New chat" }).click();
  await expect(reopened.getByRole("log", { name: "Conversation" })).toBeEmpty();

  const secondId = await ask(page);

  expect(secondId).not.toBe(sessionId);
  await expect(answerOf(reopened)).toBeVisible(FIRST_PAINT);

  // I1: Open in Ask continues the panel's new chat in Ask.
  const openInAsk = reopened.getByRole("link", {
    name: "Open in Ask",
    exact: true,
  });

  await expect(openInAsk).toHaveAttribute("href", `/ask/${secondId}`);
  await openInAsk.click();
  await expect(page).toHaveURL(`/ask/${secondId}`, FIRST_PAINT);
  // Ask is the chat, so the Agent button steps aside there (AG10).
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true })
  ).toBeVisible(FIRST_PAINT);
  await expect(agentButton(page)).toHaveCount(0);

  // R-42a: Ask's history lists the panel's first chat too.
  const listed = (await historyOf(page)).locator(`a[href="/ask/${sessionId}"]`);

  await expect(listed).toContainText(QUESTION);
  await listed.click();
  await expect(page).toHaveURL(`/ask/${sessionId}`, FIRST_PAINT);

  const conversation = page.getByRole("log", { name: "Conversation" });

  await expect(conversation.getByText(QUESTION, { exact: true })).toBeVisible(
    FIRST_PAINT
  );
  await expectAnswer(page);
  await expectNoAxeViolations(page, "Ask with the session");
});

/**
 * czjw.60: the panel keeps the tab's chat through a link and a page load, which a `next dev`
 * reload of `/ask` proves, so the answer is still there when the panel opens again.
 */
test("a reopened agent panel shows the earlier message after a link and a reload", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);

  await signIn(page, asker(testInfo));
  await page.goto("/account");

  const panel = await openAgentPanel(page);

  await ask(page);
  await expectAnswer(page);
  await panel.getByRole("button", { name: "Close the agent panel" }).click();
  await expect(panel).toBeHidden();

  // A page load on Ask, which shows no panel, then back and a reload: the tab keeps the chat.
  await page.goto("/ask");
  await page.goto("/account");
  await page.reload();

  const reopened = await openAgentPanel(page);

  await expect(
    reopened
      .getByRole("log", { name: "Conversation" })
      .getByText(QUESTION, { exact: true })
  ).toBeVisible(FIRST_PAINT);
  await expect(answerOf(reopened)).toBeVisible(FIRST_PAINT);
});

/**
 * 997df600: Ask reads a chat's artifacts again on each visit, so a version that the panel made
 * after a first visit shows on a client-side return within the app's 30 s stale time.
 */
test("Ask shows the version that the panel made after an earlier visit", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);

  await signIn(page, asker(testInfo));
  await page.goto("/account");

  const panel = await openAgentPanel(page);

  await askQuestion(page, CHART_QUESTION);
  await expect(
    panel.getByRole("link", { name: "Quantity by record" })
  ).toBeVisible(FIRST_PAINT);
  await panel.getByRole("link", { name: "Open in Ask", exact: true }).click();

  const artifact = page.getByRole("region", { name: "Artifact", exact: true });
  const conversation = page.getByRole("log", { name: "Conversation" });

  await conversation
    .getByRole("button", { name: "Quantity by record" })
    .click(FIRST_PAINT);
  await expect(artifact.getByText("Version 1 of 1")).toBeVisible(FIRST_PAINT);

  // Back is a client-side move, so the app's query cache stays.
  await page.goBack();
  await expect(page).toHaveURL(/\/account$/, FIRST_PAINT);

  const again = await openAgentPanel(page);

  await askQuestion(page, CHANGE_QUESTION);
  await expect(
    again.getByRole("link", { name: "Quantity by day" })
  ).toBeVisible(FIRST_PAINT);
  await again.getByRole("link", { name: "Open in Ask", exact: true }).click();
  await conversation
    .getByRole("button", { name: "Quantity by day" })
    .click(FIRST_PAINT);
  await expect(artifact.getByText("Version 2 of 2")).toBeVisible(FIRST_PAINT);
});

test("Ask is in the main menu for a holder of Ask, and not for anyone else", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);

  await signIn(page, asker(testInfo));
  await page.goto("/account");

  // R-42: the drawer on a phone, the menu aside on a desktop.
  const navigation = await openNavigation(page);

  await expect(
    navigation.getByRole("link", { name: "Ask", exact: true })
  ).toHaveAttribute("href", "/ask", FIRST_PAINT);

  await page.context().clearCookies();
  await signIn(page, ASK_PEOPLE.noAsk);
  await page.goto("/account");
  await expect(
    (await openNavigation(page)).getByRole("link", { name: "Ask", exact: true })
  ).toHaveCount(0);
});

test("Ask hides its chat history fully and shows it again", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);

  await signIn(page, asker(testInfo));
  await page.goto("/ask");

  if (atLg(page)) {
    const history = page.getByRole("complementary", { name: "Chat history" });

    await openUntilVisible(
      page.getByRole("button", { name: "Hide chats" }),
      page.getByRole("button", { name: "Show chats" })
    );
    // I18c: hidden is gone, not a narrow strip.
    await expect(history).toHaveCount(0);

    await page.getByRole("button", { name: "Show chats" }).click();
    await expect(history).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Hide chats" })
    ).toBeFocused();
  } else {
    const sheet = await historyOf(page);

    await expect(
      sheet.getByRole("searchbox", { name: "Search chats" })
    ).toBeVisible();
  }

  await expectNoAxeViolations(page, "Ask's chat history");
});

test("a person without Ask gets no Agent button and the denied page on Ask", async ({
  page,
}) => {
  // Two pages that a development server may compile on first use.
  test.setTimeout(180_000);

  await signIn(page, ASK_PEOPLE.noAsk);
  await page.goto("/account");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible(
    FIRST_PAINT
  );
  await expect(agentButton(page)).toHaveCount(0);

  await page.goto("/ask");
  await expect(page.getByTestId("permission-denied")).toBeVisible(FIRST_PAINT);
});

test("another person's session link answers the not-found page with nothing of the owner's", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(180_000);

  const owner = await devSession(asker(testInfo));
  const sessionId = randomUUID();

  const created = await request.post("/api/agent", {
    headers: { cookie: `${owner.name}=${owner.value}`, origin: PUBLIC_URL },
    data: {
      sessionId,
      message: {
        id: "client-message",
        role: "user",
        parts: [{ type: "text", text: QUESTION }],
      },
    },
    timeout: 180_000,
  });

  expect(created.status(), await created.text()).toBe(200);

  await signIn(page, ASK_PEOPLE.other);

  const response = await page.goto(`/ask/${sessionId}`);

  expect(response?.status()).toBe(404);
  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await expect(page.getByText(QUESTION)).toHaveCount(0);
  await expect(answerOf(page)).toHaveCount(0);
});
