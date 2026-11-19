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
import { expectTouchAreas } from "../support/touch-areas.ts";
import {
  askQuestion,
  devSession,
  FIRST_PAINT,
  FIRST_WORDS,
  hideDevelopmentWidgets,
  openAgentPanel,
  openUntilVisible,
  PUBLIC_URL,
  signInAs as signIn,
  SLOW_QUESTION,
  STOPPED_LINE,
  THIRD_PARAGRAPH,
} from "./ask-support.ts";
import { seedChat } from "./chat-seed.ts";
import { ASK_PEOPLE, DEV_MODULES, INVOICE_ASK_PEOPLE } from "./global-setup.ts";

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

// Not the "Ask" group toggle of the chat history, which shares the name.
const agentButton = (page: Page) =>
  page
    .getByRole("button", { name: "Ask", exact: true })
    .and(page.locator(':not(nav[aria-label="Chats"] *)'));

test.beforeEach(({ page }) => hideDevelopmentWidgets(page));

const CHAT_ADDRESS = /\/ask\/[0-9a-f-]{36}$/;

/** czjw.87: the first answer names the chat in the address without drawing the chat again. */
test("a question typed while the first answer streams stays in the composer when Ask names the chat", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);

  await signIn(page, asker(testInfo));
  await page.goto("/ask");

  const log = page.getByRole("log", { name: "Conversation" });
  const message = page.getByRole("textbox", { name: "Message", exact: true });

  await askQuestion(page, SLOW_QUESTION);
  await expect(log.getByText(FIRST_WORDS)).toBeVisible(FIRST_PAINT);
  await message.fill(QUESTION);

  await expect(log.getByText(THIRD_PARAGRAPH)).toBeVisible(FIRST_PAINT);
  await expect(page).toHaveURL(CHAT_ADDRESS, FIRST_PAINT);
  await expect(message).toHaveValue(QUESTION);

  // New chat in the history starts a fresh chat, also after the address changed without a load.
  await (await historyOf(page)).getByRole("link", { name: "New chat" }).click();
  await expect(page).toHaveURL(/\/ask$/, FIRST_PAINT);
  await expect(log).toBeEmpty();
});

test("Stop on Ask's first answer keeps the words so far with a Stopped line, also after a reload", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);

  await signIn(page, asker(testInfo));
  await page.goto("/ask");

  const log = page.getByRole("log", { name: "Conversation" });

  await askQuestion(page, SLOW_QUESTION);
  await expect(log.getByText(FIRST_WORDS)).toBeVisible(FIRST_PAINT);
  await page.getByRole("button", { name: "Stop the answer" }).click();

  await expect(page).toHaveURL(CHAT_ADDRESS, FIRST_PAINT);
  await expect(log.getByText(FIRST_WORDS)).toBeVisible();
  await expect(log.getByText(STOPPED_LINE, { exact: true })).toBeVisible();

  // The server stores the stopped turn after the abort, so a reload can come first; read again.
  await expect(async () => {
    await page.reload();
    await expect(log.getByText(SLOW_QUESTION)).toBeVisible({ timeout: 5000 });
    await expect(log.getByText(FIRST_WORDS)).toBeVisible({ timeout: 5000 });
    await expect(log.getByText(STOPPED_LINE, { exact: true })).toBeVisible({
      timeout: 5000,
    });
  }).toPass(FIRST_PAINT);

  await expect(log.getByText(THIRD_PARAGRAPH)).toHaveCount(0);
});

/** The last message text of every agent route POST from now on (the body of `transport.ts`). */
function agentPosts(page: Page): string[] {
  const texts: string[] = [];

  page.on("request", (request) => {
    if (!request.url().endsWith("/api/agent") || request.method() !== "POST")
      return;

    // SAFETY: the transport sends `{ sessionId, message }`, the message's parts first a text (P3).
    const { message } = request.postDataJSON() as {
      message: { parts: { text?: string }[] };
    };

    texts.push(message.parts.map((part) => part.text ?? "").join(""));
  });

  return texts;
}

// czjw.188, P18-30: the resend's answer comes from `synthetic-stream-slow-try-again`.
test("Try again under a finished answer asks the question once more", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);

  await signIn(page, asker(testInfo));
  await page.goto("/ask");

  const log = page.getByRole("log", { name: "Conversation" });

  await askQuestion(page, SLOW_QUESTION);
  await expect(log.getByText(THIRD_PARAGRAPH)).toBeVisible(FIRST_PAINT);

  const posts = agentPosts(page);
  const tryAgain = log.getByRole("button", { name: "Try again" });

  await expect(tryAgain).toHaveCount(1, FIRST_PAINT);
  await tryAgain.click();

  await expect(log.getByText(SLOW_QUESTION, { exact: true })).toHaveCount(2);
  await expect(log.getByText(THIRD_PARAGRAPH)).toHaveCount(2, FIRST_PAINT);
  expect(posts).toEqual([SLOW_QUESTION]);
});

// czjw.188, P18-29: proves the one send only; no recording answers the resend after a Stop.
test("Try again under a stopped answer sends the question once", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);

  await signIn(page, asker(testInfo));
  await page.goto("/ask");

  const log = page.getByRole("log", { name: "Conversation" });

  await askQuestion(page, SLOW_QUESTION);
  await expect(log.getByText(FIRST_WORDS)).toBeVisible(FIRST_PAINT);
  await page.getByRole("button", { name: "Stop the answer" }).click();
  await expect(log.getByText(STOPPED_LINE, { exact: true })).toBeVisible(
    FIRST_PAINT
  );

  const posts = agentPosts(page);

  await log.getByRole("button", { name: "Try again" }).click();

  await expect(log.getByText(SLOW_QUESTION, { exact: true })).toHaveCount(2);
  await expect.poll(() => posts).toEqual([SLOW_QUESTION]);
});

// czjw.190: 32 px at every width, with the 44 px touch area of the Phase 06 check.
test("the Ask suggestion pills are 32 px with a 44 px touch area", async ({
  page,
}, testInfo) => {
  test.skip(
    !DEV_MODULES.has("invoices"),
    "Ask's suggestions are dataset questions, which only the invoices module has."
  );
  test.setTimeout(180_000);

  await signIn(
    page,
    testInfo.project.name === "phone"
      ? INVOICE_ASK_PEOPLE.phone
      : INVOICE_ASK_PEOPLE.desktop
  );
  await page.goto("/ask");

  const pill = page
    .getByRole("group", { name: "Suggestions" })
    .getByRole("button")
    .first();

  await expect(pill).toBeVisible(FIRST_PAINT);

  const height = (await pill.boundingBox())?.height ?? 0;

  expect(Math.abs(height - 32)).toBeLessThanOrEqual(0.5);

  const [label, root] = await pill.evaluate((element) => [
    Number.parseFloat(getComputedStyle(element).fontSize),
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
  ]);

  expect(label).toBe(0.875 * root);

  // The desktop shell is dense on purpose (`denseRowHeight`), so the 44 px rule is the phone's.
  if (!atLg(page)) await expectTouchAreas(page, "Ask suggestions");
});

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
  await panel.getByRole("button", { name: "Close Ask" }).click();
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

  // I1: Open in Ask, in the Chat actions menu, continues the panel's new chat in Ask.
  await reopened
    .getByRole("button", { name: "Chat actions", exact: true })
    .click();

  const openInAsk = page.getByRole("menuitem", {
    name: "Open in Ask",
    exact: true,
  });

  await expect(openInAsk).toHaveAttribute("href", `/ask/${secondId}`);
  await openInAsk.click();
  await expect(page).toHaveURL(`/ask/${secondId}`, FIRST_PAINT);
  // Ask is the chat, so the Ask button steps aside there (AG10).
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true })
  ).toBeVisible(FIRST_PAINT);
  await expect(agentButton(page)).toHaveCount(0);

  // R-42a: Ask's history lists the panel's first chat too, in Ask's group and in Recents.
  const listed = (await historyOf(page))
    .locator(`a[href="/ask/${sessionId}"]`)
    .first();

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
  await panel.getByRole("button", { name: "Close Ask" }).click();
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
  await panel
    .getByRole("button", { name: "Chat actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Open in Ask", exact: true })
    .click();

  const artifact = page.getByRole("region", {
    name: "Chart or table",
    exact: true,
  });

  const conversation = page.getByRole("log", { name: "Conversation" });

  await conversation
    .getByRole("button", { name: "Quantity by record" })
    .click(FIRST_PAINT);
  await expect(
    artifact.getByRole("heading", { name: "Quantity by record" })
  ).toBeVisible(FIRST_PAINT);

  // Back is a client-side move, so the app's query cache stays.
  await page.goBack();
  await expect(page).toHaveURL(/\/account$/, FIRST_PAINT);

  const again = await openAgentPanel(page);

  await askQuestion(page, CHANGE_QUESTION);
  await expect(
    again.getByRole("link", { name: "Quantity by day" })
  ).toBeVisible(FIRST_PAINT);
  await again
    .getByRole("button", { name: "Chat actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Open in Ask", exact: true })
    .click();
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

  // czjw.200: below 1024 px Ask has one top bar, and the menu button sits in it.
  if (!atLg(page)) {
    await page.keyboard.press("Escape");
    await page.goto("/ask");
    await expect(
      page
        .locator("[data-page-top-bar]")
        .getByRole("button", { name: "Open navigation" })
    ).toBeVisible(FIRST_PAINT);
    await expect(page.locator("[data-shell-top-bar]")).toBeHidden();
  }

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

// C3 (czjw.120 item 20): the inbox line left the rail; Ask's new chat says where documents go in.
test("Ask's new chat says where documents go in", async ({ page }) => {
  test.skip(
    !DEV_MODULES.has("invoices"),
    "The one document inbox is the invoices module's."
  );
  test.setTimeout(180_000);

  await signIn(page, ASK_PEOPLE.inbox);
  await page.goto("/ask");

  await expect(
    page
      .getByRole("region", { name: "Conversation" })
      .getByText(/^To add documents, use/)
  ).toBeVisible(FIRST_PAINT);

  if (atLg(page)) {
    const history = page.getByRole("complementary", { name: "Chat history" });

    await expect(history).toBeVisible();
    await expect(history.getByText(/^To add documents, use/)).toHaveCount(0);
  }
});

// H6 (czjw.120 item 13): Rename and Delete in the header menu reach the server.
test("the chat header menu renames a chat and deletes it", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);

  const sessionId = randomUUID();
  const renamed = `Quarter review ${sessionId.slice(0, 8)}`;

  await seedChat({
    email: asker(testInfo),
    sessionId,
    turns: [{ question: "A chat to rename", answer: "Here it is." }],
  });
  await signIn(page, asker(testInfo));
  await page.goto(`/ask/${sessionId}`);

  const actions = page.getByRole("button", {
    name: "Chat actions",
    exact: true,
  });

  await openUntilVisible(actions, page.getByRole("menu"));
  await page.getByRole("menuitem", { name: "Rename" }).click();

  const rename = page.getByRole("dialog", { name: "Rename this chat" });

  await rename.getByRole("textbox", { name: "Name" }).fill(renamed);
  await rename.getByRole("button", { name: "Save" }).click();
  await expect(rename).toBeHidden();

  await page.reload();
  await expect(page.locator(`p[title="${renamed}"]`)).toBeVisible(FIRST_PAINT);

  // The chat sits in Ask's group and in Recents (DEC-57 item 11).
  const listed = (await historyOf(page))
    .locator(`a[href="/ask/${sessionId}"]`)
    .first();

  await expect(listed).toContainText(renamed);

  if (!atLg(page)) await page.keyboard.press("Escape");

  await openUntilVisible(actions, page.getByRole("menu"));
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page
    .getByRole("dialog", { name: "Delete this chat?" })
    .getByRole("button", { name: "Delete chat" })
    .click();

  await expect(page).toHaveURL(/\/ask$/, FIRST_PAINT);
  await expect(
    (await historyOf(page)).locator(`a[href="/ask/${sessionId}"]`)
  ).toHaveCount(0);

  const response = await page.goto(`/ask/${sessionId}`);

  expect(response?.status()).toBe(404);
});

/**
 * Ask's history with every Ask chat shown: a group shows its newest 3 before Show more, and the
 * other tests of this person add chats meanwhile.
 */
async function allAskChats(page: Page): Promise<Locator> {
  const history = await historyOf(page);

  const more = history
    .getByRole("group", { name: "Ask chats" })
    .getByRole("button", { name: "Show more" });

  if (await more.isVisible()) await more.click();

  return history;
}

/** A history row's own menu, whatever the row's title. */
const menuOf = (row: Locator) =>
  row.getByRole("button", { name: /^Chat actions for / });

// czjw.203: a history row's menu renames and deletes its own chat, not the open one.
test("a chat's row menu renames and deletes it", async ({ page }, testInfo) => {
  test.setTimeout(180_000);

  const third = randomUUID();

  await seedChat({
    email: asker(testInfo),
    sessionId: third,
    turns: [{ question: "A chat to delete from its row", answer: "Done." }],
  });
  await signIn(page, asker(testInfo));
  await page.goto("/ask");

  const first = await ask(page);

  await expectAnswer(page);
  await page.goto("/ask");

  const second = await askQuestion(page, CHART_QUESTION);

  await expect(page).toHaveURL(`/ask/${second}`, FIRST_PAINT);

  // A chat is listed in Ask's group and in Recents; the first row is enough.
  const rowOf = (history: Locator, id: string) =>
    history
      .getByRole("listitem")
      .filter({ has: page.locator(`a[href="/ask/${id}"]`) })
      .first();

  const history = await allAskChats(page);

  await menuOf(rowOf(history, first)).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();

  const rename = page.getByRole("dialog", { name: "Rename this chat" });

  await rename
    .getByRole("textbox", { name: "Name" })
    .fill("Renamed in its row");
  await rename.getByRole("button", { name: "Save" }).click();
  await expect(rename).toBeHidden();
  await expect(rowOf(history, first)).toContainText("Renamed in its row");
  await expect(page).toHaveURL(`/ask/${second}`);

  const deleteFromRow = async (id: string) => {
    await menuOf(rowOf(history, id)).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();

    const confirm = page.getByRole("dialog", { name: "Delete this chat?" });

    await confirm.getByRole("button", { name: "Delete chat" }).click();
    // It closes once the delete succeeds; while open it hides the history from role queries.
    await expect(confirm).toBeHidden();
  };

  // Deleting a chat that is not open leaves the open chat in place (P18-49). The open chat's id
  // comes from the page, so leaving it needs a server read of /ask (an `_rsc` request), which the
  // route would send before the history read that follows the delete. The row is not removed
  // optimistically, so its absence after the dialog closes implies that history read.
  const navigations: string[] = [];

  page.on("request", (request) => {
    if (request.url().includes("/ask?_rsc=")) navigations.push(request.url());
  });

  await deleteFromRow(third);
  await expect(history.locator(`a[href="/ask/${third}"]`)).toHaveCount(0);
  expect(navigations).toEqual([]);
  await expect(page).toHaveURL(`/ask/${second}`);
  await expect(page.getByRole("log", { name: "Conversation" })).not.toBeEmpty();

  await deleteFromRow(second);

  await expect(page).toHaveURL(/\/ask$/, FIRST_PAINT);
  await expect(page.getByRole("log", { name: "Conversation" })).toBeEmpty();

  const after = await allAskChats(page);

  await expect(after.locator(`a[href="/ask/${second}"]`)).toHaveCount(0);
  await expect(rowOf(after, first)).toContainText("Renamed in its row");
});

test("a person without Ask gets no Ask button and the denied page on Ask", async ({
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
  await expect(
    page.getByRole("heading", { name: "Page not found" })
  ).toBeVisible();
  await expect(page.getByText(QUESTION)).toHaveCount(0);
  await expect(answerOf(page)).toHaveCount(0);
});
