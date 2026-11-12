import { mintDevSession } from "@genie/core/testing";
import { expect, type Locator, type Page } from "@playwright/test";

import { TEST_AUTH_ENV } from "../../testing/auth-env.ts";
import { FIRST_PAINT } from "./dev-support.ts";
import { DEV_DB_PORT, DEV_PORT } from "./global-setup.ts";

export { FIRST_PAINT };

/** What the Ask specs share: a person's session, one question, and the development widgets hidden. */

export const PUBLIC_URL = `http://127.0.0.1:${DEV_PORT}`;

/** `stream-slow-1` answers it in three paragraphs, one event every 150 ms. */
export const SLOW_QUESTION = "Describe each placeholder record.";

export const FIRST_WORDS = "Placeholder records are fictional";

export const THIRD_PARAGRAPH = "You can ask me to count the records";

/** The line under an answer that Stop ended (czjw.110). */
export const STOPPED_LINE = "Stopped. Ask again when you are ready.";

export function devSession(email: string) {
  return mintDevSession({
    databaseUrl: `postgres://genie:genie@127.0.0.1:${DEV_DB_PORT}/genie`,
    publicUrl: PUBLIC_URL,
    secret: TEST_AUTH_ENV.BETTER_AUTH_SECRET,
    subject: { email },
  });
}

export async function signInAs(page: Page, email: string): Promise<void> {
  const { name, value, url, httpOnly, sameSite, expires } =
    await devSession(email);

  // Playwright refuses a cookie that carries both `url` and `path`; the `url` names the path.
  await page
    .context()
    .addCookies([{ name, value, url, httpOnly, sameSite, expires }]);
}

/** Asks `text` in an open conversation and answers the session id the browser sent. */
export async function askQuestion(page: Page, text: string): Promise<string> {
  const sent = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/agent") && request.method() === "POST"
  );

  await page.getByRole("textbox", { name: "Message", exact: true }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();

  // SAFETY: the agent panel and Ask send the route's JSON body, whose `sessionId` is a string (P3).
  const { sessionId } = (await sent).postDataJSON() as { sessionId: string };

  return sessionId;
}

/**
 * Clicks `trigger` until `target` shows, as `openNavigation` does: a click before hydration does
 * nothing, and each retry clicks only while the target is hidden, so it never toggles one shut.
 */
export async function openUntilVisible(
  trigger: Locator,
  target: Locator
): Promise<void> {
  // FIRST_PAINT, not 15 s: after a source change a cold `next dev` compile hydrated later than that.
  await expect(async () => {
    if (!(await target.isVisible())) await trigger.click();

    await expect(target).toBeVisible({ timeout: 1000 });
  }).toPass(FIRST_PAINT);
}

/** Opens the agent panel with the Agent button: a column from 1280 px, a sheet below (AG11). */
export async function openAgentPanel(page: Page): Promise<Locator> {
  const panel = page.getByRole("region", { name: "Agent", exact: true });

  await openUntilVisible(
    page.getByRole("button", { name: "Agent", exact: true }),
    panel
  );

  return panel;
}

/**
 * Keeps the TanStack Devtools trigger off the agent panel's Send. Call before the first page. Core
 * keeps the OpenUI devtools widget off itself (xok3.65).
 */
export async function hideDevelopmentWidgets(
  page: Pick<Page, "addInitScript">
): Promise<void> {
  await page.addInitScript(() => {
    // P11: the TanStack Devtools trigger floats at the bottom right in development, over the
    // bubble and the sheet's Send; its own setting hides it unless the address carries its flag.
    localStorage.setItem(
      "tanstack_devtools_settings",
      JSON.stringify({ requireUrlFlag: true })
    );
  });
}
