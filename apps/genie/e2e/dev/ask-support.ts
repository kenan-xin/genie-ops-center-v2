import { mintDevSession } from "@genie/core/testing";
import type { Page } from "@playwright/test";

import { TEST_AUTH_ENV } from "../../testing/auth-env.ts";
import { DEV_DB_PORT, DEV_PORT } from "./global-setup.ts";

/** What the Ask specs share: a person's session, one question, and the development widgets hidden. */

export const PUBLIC_URL = `http://127.0.0.1:${DEV_PORT}`;

/** A development server compiles a route when it is first asked for (see `devtools.spec.ts`). */
export const FIRST_PAINT = { timeout: 120_000 };

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

  await page.getByRole("textbox", { name: "Message Ask" }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();

  // SAFETY: the bubble and Ask send the route's JSON body, whose `sessionId` is a string (P3).
  const { sessionId } = (await sent).postDataJSON() as { sessionId: string };

  return sessionId;
}

/** Keeps the development widgets off the bubble and the sheet's Send. Call before the first page. */
export async function hideDevelopmentWidgets(page: Page): Promise<void> {
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
}
