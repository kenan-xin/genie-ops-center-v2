import type { Page } from "@playwright/test";

import { queryDatabase } from "./database.ts";

/** How many session rows carry the id: "1" while the session lives, "0" once it ended. */
export async function sessionRowCount(id: string): Promise<string> {
  const [count] = await queryDatabase(
    `select count(*) from session where id = '${id}'`
  );

  return count ?? "0";
}

/** The current browser session's row id, read through the cookie the sign-in set. */
export async function currentSessionId(
  page: Page,
  email: string
): Promise<string> {
  const cookie = (await page.context().cookies()).find(
    (entry) => entry.name === "genie-session"
  );

  if (cookie === undefined)
    throw new Error("the browser holds no session cookie");

  const token = decodeURIComponent(cookie.value).split(".")[0] ?? "";

  const [id] = await queryDatabase(
    `select id from session where token = '${token}' and user_id = (select id from "user" where email = '${email}')`
  );

  if (id === undefined)
    throw new Error("no session row for the browser cookie");

  return id;
}
