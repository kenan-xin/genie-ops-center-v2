import { expect, test, type Page } from "@playwright/test";

import { e2eReaderEmail } from "../testing/e2e-keycloak.ts";
import { queryDatabase } from "./support/database.ts";
import { signInThroughKeycloak } from "./support/sign-in.ts";

/** The tenant's seeded idle window; staging a session past it makes the next read refuse (R-14). */
const IDLE_MINUTES = 15;

/**
 * The browser proof for the Audit log route.
 *
 * The anonymous cases stay as controls: the route stays mounted and refuses on the server (R-35),
 * and the list procedure refuses through the transport as `unauthenticated` at 401 rather than a
 * bare permission refusal (Spec 2 R-14). The signed-in success path at both viewports belongs to
 * S2-16; the expired-session case below proves the tRPC refusal lands the browser on the sign-in
 * page's session-expired state.
 */
test("the audit route refuses an anonymous request and reveals nothing", async ({
  page,
}) => {
  await page.goto("/admin/audit");

  await expect(page.getByTestId("permission-denied")).toBeVisible();
  // The refused page reveals nothing it would have rendered.
  await expect(page.getByRole("heading", { name: "Audit log" })).toHaveCount(0);
  await expect(page.getByText(/Who did what/)).toHaveCount(0);
});

test("the audit list procedure refuses an anonymous request through the real transport", async ({
  request,
  baseURL,
}) => {
  const response = await request.get(
    `${baseURL}/api/trpc/audit.list?input=${encodeURIComponent("{}")}`
  );

  expect(response.status()).toBe(401);

  // SAFETY: the body is the tRPC envelope this route wrote, and the assertions below read the
  // two fields this test checks.
  const body = (await response.json()) as {
    error?: { data?: { code?: string; appCode?: string } };
  };

  expect(body.error?.data?.code).toBe("UNAUTHORIZED");
  expect(body.error?.data?.appCode).toBe("unauthenticated");
});

/** The current browser session's row id, read through the cookie the sign-in set. */
async function currentSessionId(page: Page, email: string): Promise<string> {
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

/**
 * Drives the controlled search filter with a synthetic `input` event only. Playwright's own
 * `fill` would also dispatch a pointer or key event, which the session-activity client listens
 * for; that call would expire the session first and mask the tRPC proof.
 */
async function setSearchQuery(page: Page, value: string): Promise<void> {
  await page.getByLabel("Search summary or target").evaluate((node, text) => {
    // SAFETY: this locator resolved the audit search box, so the node is an HTMLInputElement.
    const input = node as HTMLInputElement;

    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;

    setter?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
}

test("an expired session on a tRPC call lands on the sign-in page", async ({
  page,
}, testInfo) => {
  const email = e2eReaderEmail("audit", testInfo.project.name);

  await signInThroughKeycloak(page, { email });

  await page.goto("/admin/audit");

  // The signed-in reader's grant renders the route; the client mounts and reads the list.
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await expect(page.getByLabel("Search summary or target")).toBeVisible();

  const current = await currentSessionId(page, email);

  // The tenant's real 15 minute window, staged past: the next enforced read refuses the row.
  await queryDatabase(
    `update session set last_active_at = now() - interval '${IDLE_MINUTES + 1} minutes' where id = '${current}'`
  );

  // The synthetic event drives no pointer or key activity, so the session-activity call cannot
  // expire the session first; this records that control.
  const activityCalls: string[] = [];

  page.on("request", (request) => {
    if (request.url().includes("/api/session/activity")) {
      activityCalls.push(request.url());
    }
  });

  const refusal = page.waitForResponse(
    (response) =>
      response.url().includes("/api/trpc/audit.list") &&
      response.status() === 401
  );

  await setSearchQuery(page, "e2e");

  // The tRPC answer is the unauthenticated refusal (Spec 2 R-14), and the client lands the
  // browser on the sign-in page's expired state (R-17a). The response body is not read: the
  // client navigates on it, and its app code is pinned by the app integration suite.
  const answer = await refusal;

  expect(answer.status()).toBe(401);

  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
    .toBe("/sign-in");

  expect(new URL(page.url()).searchParams.get("error")).toBe("session_expired");

  await expect(page.getByTestId("sign-in-banner")).toBeVisible();

  expect(activityCalls).toEqual([]);
});
