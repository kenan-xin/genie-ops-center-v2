import { expect, test, type Page } from "@playwright/test";

/**
 * The development panels, in a real browser.
 *
 * The ordinary end-to-end run drives the built image, where the devtools are
 * excluded on purpose, so it can never show a panel. This file is the other
 * half of that proof and runs against `next dev`, which `global-setup.ts`
 * starts on the host with `--hostname 127.0.0.1`.
 *
 * That hostname is load-bearing. Next refuses its development-only resources,
 * `/_next/hmr` among them, for an origin it does not consider its own, and its
 * allowlist carries `localhost` but not the bare `127.0.0.1`. The browser
 * reaches this server at `127.0.0.1`, so without the flag the HMR socket is
 * refused, the development client reconnects and reloads in a loop, and the
 * page never hydrates. The devtools mount is `ssr: false`, so it is client-only:
 * no hydration means the shell never renders at all. That is the whole of a
 * failure once misread here as an upstream defect in the shell.
 *
 * Two interface notes, both true of `@tanstack/react-devtools` 0.10.12 with the
 * core 0.14.2 it pins, on Next 16.3.5 and React 19.3:
 *
 * - The shell's panel switches are plain buttons, not ARIA tabs, so they are
 *   reached by their accessible button name.
 * - The Genie Ops Center panel is the only panel whose content this application
 *   supplies. Query, Form and Pacer mount their own panels and are asserted for
 *   availability, not content.
 *
 * Do not weaken these into a check that the empty shell container exists. That
 * would turn a mount failure into a passing gate.
 */

/**
 * A development server compiles a dynamic chunk when it is first asked for, so
 * the first thing each spec waits for gets a budget that covers a cold compile.
 * This is a retrying assertion, not a sleep: it settles as soon as the element
 * is there.
 */
const FIRST_PAINT = { timeout: 120000 };

/** The shell's launcher, then the named panel inside it. */
async function openPanel(page: Page, name: string): Promise<void> {
  await page.goto("/");

  const trigger = page.getByRole("button", { name: /tanstack devtools/i });

  // The mount itself. This is a precondition, not the acceptance: the
  // assertions that follow are what the clause requires.
  await expect(trigger).toBeVisible(FIRST_PAINT);
  await trigger.click();

  await page.getByRole("button", { name }).click();
}

/** One value, read through the exact term that labels it rather than by position. */
function fact(page: Page, label: string) {
  // An exact XPath match, not `hasText`: Playwright's `hasText` is a
  // case-insensitive substring, so a later term such as "Database schema" would
  // satisfy a lookup for "Database" and this would assert the wrong value.
  return page.locator(
    `xpath=//dt[normalize-space(.)="${label}"]/following-sibling::dd[1]`
  );
}

test("the devtools open and report this deployment truthfully", async ({
  page,
}) => {
  test.setTimeout(180000);

  await openPanel(page, "Genie Ops Center");

  await expect(page.getByRole("heading", { name: "Deployment" })).toBeVisible();

  // The database this deployment really runs against, the module compiled into
  // it, the one key the stub grants, and the sentence that says nobody is
  // signed in. Every one is read from the running context, not from a fixture.
  await expect(fact(page, "Database")).toHaveText("genie");
  await expect(fact(page, "Modules")).toHaveText("placeholder");
  await expect(fact(page, "Permissions")).toHaveText("placeholder:read");
  await expect(fact(page, "User")).toHaveText(
    "No user is signed in. Section 0 has no identity yet."
  );
});

test("the Query, Form and Pacer panels are available", async ({ page }) => {
  test.setTimeout(180000);

  await page.goto("/");

  const trigger = page.getByRole("button", { name: /tanstack devtools/i });

  await expect(trigger).toBeVisible(FIRST_PAINT);
  await trigger.click();

  // Asserted together rather than in a loop: they are independent, and this
  // repository's lint refuses `await` inside a loop.
  await Promise.all(
    ["TanStack Query", "TanStack Form", "TanStack Pacer"].map((name) =>
      expect(page.getByRole("button", { name })).toBeVisible()
    )
  );
});

test("puts no secret on the screen", async ({ page }) => {
  test.setTimeout(180000);

  await openPanel(page, "Genie Ops Center");

  await expect(page.getByRole("heading", { name: "Deployment" })).toBeVisible();

  const shown = await page.locator("body").innerText();

  // The connection string this deployment really runs on carries a user, a
  // password, a host and a port. None of them may be on the page; 5433 is the
  // port this run's database is published on (`compose.dev-e2e.yaml`).
  expect(shown).not.toContain("genie:genie");
  expect(shown).not.toContain("5433");
  expect(shown).not.toContain("postgres://");
  expect(shown).not.toContain("127.0.0.1");
});
