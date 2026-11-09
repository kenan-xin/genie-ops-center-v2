import type { TenantContext } from "@genie/core";
import { insertDashboard } from "@genie/module-analytics/testing";
import { expect, type Locator, type Page } from "@playwright/test";

import {
  SLIDES_CHANGE_DECK_ID,
  SLIDES_CHANGE_DECK_TITLE,
} from "../../testing/slides-change.ts";
import {
  MONTHLY_DECK,
  SLIDES_CHAT_MESSAGE,
} from "../../testing/slides-chat.ts";
import {
  FIRST_PAINT,
  openAgentPanel,
  openUntilVisible,
  signInAs,
} from "./ask-support.ts";
import { devTenant } from "./chat-seed.ts";
import { onPhone } from "./dev-support.ts";
import { SLIDES_PEOPLE } from "./global-setup.ts";
import { resetChangeDeck } from "./slides-support.ts";

/**
 * What the surface specs share: the Ask handoff of the chat deck, the session that Ask handed over
 * to, and the person's dashboards. Decks go through `slides-support.ts`.
 */

/** A tap on the phone project, where a fixed bar may cover a control. */
async function activate(page: Page, target: Locator): Promise<void> {
  if (onPhone(page)) {
    await target.tap();

    return;
  }

  await target.click();
}

/** Sends `text` in `chat` and answers the session id that the browser sent. */
export async function send(
  page: Page,
  chat: Locator,
  text: string
): Promise<string> {
  const sent = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/agent") && request.method() === "POST"
  );

  await chat.getByRole("textbox", { name: "Message", exact: true }).fill(text);
  await activate(page, chat.getByRole("button", { name: "Send" }));

  // SAFETY: the agent panel sends the route's JSON body, whose `sessionId` is a string (P3).
  const { sessionId } = (await sent).postDataJSON() as { sessionId: string };

  return sessionId;
}

/** On a record page, the Agent button opens the surface's own agent, named `name`. */
export async function openSurfaceAgent(
  page: Page,
  name: "Slides agent" | "Dashboards agent"
): Promise<Locator> {
  const surface = page.getByRole("region", { name, exact: true });

  await openUntilVisible(
    page.getByRole("button", { name: "Agent", exact: true }),
    surface
  );

  return surface;
}

/**
 * Opens a record page once, so that `next dev` compiles it before a run builds on it: a cold
 * compile can outlast the whole paced build.
 */
export async function warm(
  page: Page,
  path: string,
  heading: string
): Promise<void> {
  await page.goto(path);
  await expect(
    page.getByRole("heading", { level: 1, name: heading })
  ).toBeVisible(FIRST_PAINT);
}

/**
 * Signs in as the Slides chat person and asks for the chat deck in Ask's panel beside the Slides
 * list; the deck page opens at once. Answers the Ask chat's id.
 */
export async function handOverDeck(page: Page): Promise<string> {
  await signInAs(page, SLIDES_PEOPLE.chat);
  await resetChangeDeck(SLIDES_PEOPLE.chat);
  await warm(
    page,
    `/m/slides/decks/${SLIDES_CHANGE_DECK_ID}`,
    SLIDES_CHANGE_DECK_TITLE
  );
  await warm(page, "/m/slides/decks", "Slides");

  const askId = await send(
    page,
    await openAgentPanel(page),
    SLIDES_CHAT_MESSAGE
  );

  await expect(
    page.getByRole("heading", { level: 1, name: MONTHLY_DECK.title })
  ).toBeVisible(FIRST_PAINT);

  return askId;
}

/** Hands the chat deck over and waits until the Slides agent saved all five slides. */
export async function handOverWholeDeck(page: Page): Promise<void> {
  await handOverDeck(page);

  await expect(
    page
      .getByRole("region", { name: "Slides agent" })
      .locator("header")
      .getByText("Saved", { exact: true })
  ).toBeVisible(FIRST_PAINT);
  await expect(
    page
      .getByRole("navigation", { name: "Slides" })
      .getByRole("button", { name: /^Slide \d+:/ })
  ).toHaveCount(5);
}

let tenantContext: TenantContext | undefined;

const context = () => (tenantContext ??= devTenant());

/** Frees the pool this process's context opened, so Playwright exits without it. */
export async function closeSurfaceDatabase(): Promise<void> {
  await tenantContext?.db.$client.end();

  tenantContext = undefined;
}

async function userIdOf(email: string): Promise<string> {
  const { rows } = await context().db.$client.query<{ id: string }>(
    'select id from "user" where email = $1',
    [email]
  );

  const id = rows[0]?.id;

  if (id === undefined)
    throw new Error(`no person matches ${JSON.stringify({ email })}`);

  return id;
}

export type HandedOver = {
  readonly id: string;
  readonly title: string;
  readonly recordId: string;
};

/** The session that the Ask chat `askId` handed over to, or undefined before the handoff. */
export async function handedOverFrom(
  askId: string
): Promise<HandedOver | undefined> {
  const { rows } = await context().db.$client.query<HandedOver>(
    'select id, title, record_id as "recordId" from agent_session where handed_from_session_id = $1',
    [askId]
  );

  return rows[0];
}

/**
 * Deletes the person's dashboards with these names, so a killed run never leaves a name that
 * `createRecord` refuses as taken.
 */
export async function removeDashboardsNamed(
  email: string,
  names: readonly string[]
): Promise<void> {
  await context().db.$client.query(
    "delete from dashboard where owner_user_id = $1 and name = any($2)",
    [await userIdOf(email), names]
  );
}

/** An empty dashboard of the person's own, by name; answers its id. */
export async function insertEmptyDashboard(
  email: string,
  name: string
): Promise<string> {
  return insertDashboard(context(), {
    ownerUserId: await userIdOf(email),
    name,
  });
}
