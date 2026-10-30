import { randomUUID } from "node:crypto";

import { mintDevSession } from "@genie/core/testing";
import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

import { TEST_AUTH_ENV } from "../../testing/auth-env.ts";
import { expectNoAxeViolations } from "../support/axe.ts";
import { atLg } from "../support/shell.ts";
import { ASK_PEOPLE, DEV_DB_PORT, DEV_PORT } from "./global-setup.ts";

/**
 * Ask and the chat bubble in `next dev` with the model stand-in (Spec 7 AC-8 line 4, R-42, P13).
 * The stand-in replays the placeholder's recording `what-can-you-do`, so every question here is
 * exactly that one, and the KPI's 3 comes from the chart gate over the three seeded records.
 */

const PUBLIC_URL = `http://127.0.0.1:${DEV_PORT}`;

/** A development server compiles a route when it is first asked for (see `devtools.spec.ts`). */
const FIRST_PAINT = { timeout: 120_000 };

const QUESTION = "What can you do?";

const ANSWER =
  "I answer questions about the records you may read, as of the reporting date.";

/** Each project asks as its own person, so the two viewports never share a session list. */
const asker = (testInfo: TestInfo) =>
  testInfo.project.name === "phone" ? ASK_PEOPLE.phone : ASK_PEOPLE.desktop;

function devSession(email: string) {
  return mintDevSession({
    databaseUrl: `postgres://genie:genie@127.0.0.1:${DEV_DB_PORT}/genie`,
    publicUrl: PUBLIC_URL,
    secret: TEST_AUTH_ENV.BETTER_AUTH_SECRET,
    subject: { email },
  });
}

async function signIn(page: Page, email: string): Promise<void> {
  const { name, value, url, httpOnly, sameSite, expires } =
    await devSession(email);

  // Playwright refuses a cookie that carries both `url` and `path`; the `url` names the path.
  await page
    .context()
    .addCookies([{ name, value, url, httpOnly, sameSite, expires }]);
}

/** Asks the question in an open conversation and answers the session id the browser sent. */
async function ask(page: Page): Promise<string> {
  const sent = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/agent") && request.method() === "POST"
  );

  await page.getByRole("textbox", { name: "Message Ask" }).fill(QUESTION);
  await page.getByRole("button", { name: "Send" }).click();

  // SAFETY: the bubble and Ask send the route's JSON body, whose `sessionId` is a string (P3).
  const { sessionId } = (await sent).postDataJSON() as { sessionId: string };

  return sessionId;
}

/** The answer's paragraph and the KPI that the gate drew. */
async function expectAnswer(page: Page): Promise<void> {
  await expect(page.getByText(ANSWER)).toBeVisible(FIRST_PAINT);
  await expect(
    page
      .getByRole("figure", { name: "Placeholder records" })
      .getByText("3", { exact: true })
  ).toBeVisible(FIRST_PAINT);
}

/**
 * Clicks `trigger` until `target` shows, as `openNavigation` does: a click before hydration does
 * nothing, and each retry clicks only while the target is hidden, so it never toggles one shut.
 */
async function openUntilVisible(trigger: Locator, target: Locator) {
  // FIRST_PAINT, not 15 s: after a source change a cold `next dev` compile hydrated later than that.
  await expect(async () => {
    if (!(await target.isVisible())) await trigger.click();

    await expect(target).toBeVisible({ timeout: 1000 });
  }).toPass(FIRST_PAINT);
}

async function openBubble(page: Page) {
  const bubble = page.getByRole("dialog", { name: "Ask" });

  await openUntilVisible(
    page.getByRole("button", { name: "Open Ask" }),
    bubble
  );

  return bubble;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // P11: react-lang mounts its Inspect widget in development unless this flag is already set.
    Object.assign(globalThis, {
      [Symbol.for("openui.devtools.autoMount")]: true,
    });
    // The TanStack Devtools trigger floats at the bottom right in development, over the bubble and
    // the sheet's Send; its own setting hides it unless the address carries its flag.
    localStorage.setItem(
      "tanstack_devtools_settings",
      JSON.stringify({ requireUrlFlag: true })
    );
  });
});

test("the bubble and Ask share a session, and the bubble opens again on a new chat", async ({
  page,
}, testInfo) => {
  // A development server compiles the shell, Ask, the route and the chart gate on first use.
  test.setTimeout(180_000);

  await signIn(page, asker(testInfo));
  await page.goto("/account");
  await expect(page.getByRole("button", { name: "Open Ask" })).toBeVisible(
    FIRST_PAINT
  );

  const bubble = await openBubble(page);
  const sessionId = await ask(page);

  await expectAnswer(page);
  await expectNoAxeViolations(page, "The open bubble");

  // B11.1: on the same page, opening again starts a new chat, and the history keeps the first.
  await bubble.getByRole("button", { name: "Close" }).click();
  await expect(bubble).toBeHidden();

  const reopened = await openBubble(page);

  await expect(reopened.getByRole("log", { name: "Conversation" })).toBeEmpty();
  await expect(
    reopened
      .getByRole("navigation", { name: "Chats" })
      .locator(`a[href="/ask/${sessionId}"]`)
  ).toHaveText(QUESTION);
  expect(await ask(page)).not.toBe(sessionId);
  await expect(reopened.getByText(ANSWER)).toBeVisible(FIRST_PAINT);

  await reopened.getByRole("link", { name: "Open Ask" }).click();
  await expect(page).toHaveURL(/\/ask$/, FIRST_PAINT);

  const listed = page
    .locator(`a[href="/ask/${sessionId}"]`)
    .filter({ visible: true });

  // Below `lg` the list sits in the closed "Chats" disclosure.
  if (!atLg(page)) {
    await openUntilVisible(page.getByRole("button", { name: "Chats" }), listed);
  }

  await listed.click();
  await expect(page).toHaveURL(`/ask/${sessionId}`, FIRST_PAINT);

  const conversation = page.getByRole("log", { name: "Conversation" });

  await expect(conversation.getByText(QUESTION, { exact: true })).toBeVisible(
    FIRST_PAINT
  );
  await expectAnswer(page);
  await expectNoAxeViolations(page, "Ask with the session");
});

test("a person without Ask gets no bubble and the denied page on Ask", async ({
  page,
}) => {
  // Two pages that a development server may compile on first use.
  test.setTimeout(180_000);

  await signIn(page, ASK_PEOPLE.noAsk);
  await page.goto("/account");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible(
    FIRST_PAINT
  );
  await expect(page.getByRole("button", { name: "Open Ask" })).toHaveCount(0);

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
  await expect(page.getByText(ANSWER)).toHaveCount(0);
});
