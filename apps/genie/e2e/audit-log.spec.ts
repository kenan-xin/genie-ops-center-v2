import { randomUUID } from "node:crypto";

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
 * bare permission refusal (Spec 2 R-14). The signed-in success path at both viewports is the
 * AC-16 case at the end; the expired-session case proves the tRPC refusal lands the browser on the
 * sign-in page's session-expired state.
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

/** The calendar date `offset` days ago, as the date inputs take it. */
function day(offset: number): string {
  return new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
}

/** The footer count the screen shows for the loaded page against the matching total. */
function showing(page: Page, loaded: number, total: number) {
  return page.getByText(`Showing ${loaded} of ${total}`);
}

/** The one visible row or list entry for an event, at either viewport. */
function eventRow(page: Page, summary: string) {
  // The table row on desktop and the list entry on phone; the search chip also names the query.
  return page
    .locator("tr[role=button], li > button")
    .filter({ hasText: summary })
    .filter({ visible: true });
}

/**
 * AC-16 at phone and desktop (R-67 to R-69): a signed-in reader with `core:audit:read` searches,
 * pages newest first with Load more, narrows by actor, action, target type, date range and the
 * operator filter, opens a linked target and a removed one, and finds no export control. The rows
 * carry a marker unique to this run and project, so the counts are exact.
 */
test("a signed-in reader filters, pages and opens the audit log (AC-16)", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);

  const email = e2eReaderEmail("audit", testInfo.project.name);
  const marker = `S2-16 audit ${testInfo.project.name} ${randomUUID().slice(0, 8)}`;

  const [actorId] = await queryDatabase(
    `select id from "user" where email = '${email}'`
  );

  // 55 rows by the reader, newest first as row 1; two catalogue rows of another action; three
  // operator rows (null actor, `ops:`, which the operator filter selects rather than the action
  // filter's fixed catalogue, R-45, R-68); one row whose target the placeholder resolver links; one
  // row older than the default 30 days.
  await queryDatabase(
    [
      `insert into audit_event (occurred_at, actor_user_id, action, target_type, target_id, summary)
         select now() - make_interval(mins => n), '${actorId}', 'core:person_added', 'user', 'e2e-missing-' || n, '${marker} row ' || n
           from generate_series(1, 55) n`,
      `insert into audit_event (occurred_at, actor_user_id, action, target_type, target_id, summary)
         select now() - interval '1 hour' - make_interval(mins => n), '${actorId}', 'core:role_created', 'role', 'e2e-role-' || n, '${marker} role ' || n
           from generate_series(1, 2) n`,
      `insert into audit_event (occurred_at, actor_user_id, action, summary)
         select now() - interval '2 hours' - make_interval(mins => n), null, 'ops:setup', '${marker} operator ' || n
           from generate_series(1, 3) n`,
      `insert into audit_event (occurred_at, actor_user_id, action, target_type, target_id, summary)
         values (now() - interval '3 hours', '${actorId}', 'core:person_added', 'placeholder-record', 'e2e-linked', '${marker} linked')`,
      `insert into audit_event (occurred_at, actor_user_id, action, target_type, target_id, summary)
         values (now() - interval '40 days', '${actorId}', 'core:person_added', 'user', 'e2e-old', '${marker} old')`,
    ].join("; ")
  );

  await signInThroughKeycloak(page, { email });
  await page.goto("/admin/audit");

  const search = page.getByLabel("Search summary or target");

  await search.fill(marker);

  // The new query keeps the screen mounted, so the search box keeps focus while it reloads.
  await expect(showing(page, 50, 61)).toBeVisible();
  await expect(search).toBeFocused();

  // Newest first, one keyset page of 50, then Load more appends the rest (R-67).
  await expect(showing(page, 50, 61)).toBeVisible();
  await expect(page.getByText(new RegExp(`${marker} row `)).first()).toHaveText(
    `${marker} row 1`
  );

  await page.getByRole("button", { name: "Load more" }).click();

  await expect(showing(page, 61, 61)).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);

  await page.getByRole("button", { name: /^Filters/ }).click();

  // Action.
  await page
    .getByLabel("Action", { exact: true })
    .selectOption("core:role_created");
  await expect(showing(page, 2, 2)).toBeVisible();
  await page.getByLabel("Action", { exact: true }).selectOption("all");

  // The operator filter: null actor and an `ops:` action (R-68).
  await page.getByRole("checkbox", { name: "Operator rows only" }).check();
  await expect(showing(page, 3, 3)).toBeVisible();
  await page.getByRole("checkbox", { name: "Operator rows only" }).uncheck();

  // Actor, by the reader's own id, and the system actor of the operator rows.
  await page.getByLabel("Actor", { exact: true }).selectOption(actorId ?? "");
  await expect(showing(page, 50, 58)).toBeVisible();
  await page.getByLabel("Actor", { exact: true }).selectOption("system");
  await expect(showing(page, 3, 3)).toBeVisible();
  await page.getByLabel("Actor", { exact: true }).selectOption("all");

  // Target type.
  await page
    .getByLabel("Target type", { exact: true })
    .selectOption("placeholder-record");
  await expect(showing(page, 1, 1)).toBeVisible();
  await page.getByLabel("Target type", { exact: true }).selectOption("all");

  // Date range: a custom window around the row older than the default 30 days.
  await page.getByLabel("Date range", { exact: true }).selectOption("custom");
  await page.getByLabel("From", { exact: true }).fill(day(45));
  await page.getByLabel("To", { exact: true }).fill(day(35));
  await expect(showing(page, 1, 1)).toBeVisible();
  await expect(page.getByText(`${marker} old`).first()).toBeAttached();
  await page.getByLabel("Date range", { exact: true }).selectOption("30d");
  // The unfiltered query is cached with both pages, so only the total is fixed here.
  await expect(page.getByText(/^Showing \d+ of 61$/)).toBeVisible();

  // Close the filter panel, so it covers no row.
  await page.getByRole("button", { name: /^Filters/ }).click();

  // A target the resolver links and the viewer may open offers Open (R-69).
  await page.getByLabel("Search summary or target").fill(`${marker} linked`);
  await expect(showing(page, 1, 1)).toBeVisible();
  await eventRow(page, `${marker} linked`).click();

  const sheet = page.getByRole("dialog", { name: "Audit event" });

  await expect(sheet.getByRole("button", { name: /Open/ })).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();

  // A target that no longer exists is shown without a link.
  await page.getByLabel("Search summary or target").fill(`${marker} row 55`);
  await expect(showing(page, 1, 1)).toBeVisible();
  await eventRow(page, `${marker} row 55`).click();

  await expect(sheet.getByText("Removed")).toBeVisible();
  await expect(sheet.getByRole("button", { name: /Open/ })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Close" }).click();

  // No export (DEC-16).
  await expect(page.getByRole("button", { name: /export/i })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /export/i })).toHaveCount(0);
});
