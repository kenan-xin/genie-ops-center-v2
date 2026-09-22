import { expect, test } from "@playwright/test";

/**
 * The development panels, in a real browser.
 *
 * The ordinary end-to-end run drives the built image, where the devtools are
 * excluded on purpose, so it can never show a panel. This file is the other
 * half of that proof and runs against `next dev`.
 *
 * STATUS: red, on an upstream fault, measured as follows.
 *
 * With `ssr: false`, which the plan requires, the shell's container never
 * reaches the document at all: 120 seconds against a warm development server.
 * With that option removed, the container attaches within seconds and then
 * stays empty for a further 90 seconds, with no child and no shadow root.
 *
 * The cause is in the shell, not here. `TanStackDevtoolsCore.mount()` resolves
 * a dynamic import and swallows every failure in a `.catch`, so a load that
 * fails reports nothing: no console error, no page error, no failed request, no
 * response over 400 and no policy violation. All five were checked.
 *
 * Versions: @tanstack/react-devtools 0.10.12, which is its latest, with the
 * core 0.14.2 that it pins exactly, on Next 16.3.5 and React 19.3.
 *
 * The assertions below are what the acceptance clause asks for and are written
 * against the documented interface, not against a rendering anyone has seen
 * here, so treat their selectors as unverified until the shell renders once.
 *
 * Do not weaken these into a check that the empty container exists. That would
 * turn a known failure into a passing gate.
 */

/** The shell's own container. */
const CONTAINER = 'body > div[style*="absolute"]';

/**
 * A development server compiles a dynamic chunk when it is first asked for, so
 * the first thing each spec waits for gets a budget that covers a cold compile.
 * This is a retrying assertion, not a sleep: it settles as soon as the element
 * is there.
 */
const FIRST_PAINT = { timeout: 120000 };

test("the devtools open and report this deployment truthfully", async ({
  page,
}) => {
  test.setTimeout(180000);

  await page.goto("/");

  // The boundary really mounted: the shell put its container in the document.
  // This is a precondition, not the acceptance, and the assertions below are
  // what the clause actually requires.
  await expect(page.locator(CONTAINER)).toBeAttached(FIRST_PAINT);

  const trigger = page.getByRole("button", { name: /tanstack devtools/i });

  await expect(trigger).toBeVisible(FIRST_PAINT);
  await trigger.click();

  // The Genie Ops Center panel, by its accessible name.
  const genie = page.getByRole("tab", { name: "Genie Ops Center" });

  await expect(genie).toBeVisible();
  await genie.click();

  const panel = page.getByRole("heading", { name: "Deployment" });

  await expect(panel).toBeVisible();

  // Truthful diagnostics: the database this deployment really runs against, the
  // module compiled into it, the one key the stub grants, and the sentence that
  // says nobody is signed in. Read through the terms that label them.
  const database = page.getByText("Database", { exact: true });

  await expect(database).toBeVisible();
  await expect(
    page.locator("dd").filter({ hasText: "genie" }).first()
  ).toBeVisible();

  await expect(page.getByText("placeholder", { exact: true })).toBeVisible();
  await expect(
    page.getByText("placeholder:read", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("No user is signed in. Section 0 has no identity yet.")
  ).toBeVisible();

  // No secret is on the screen. The connection string carries a password and a
  // host, and neither may appear anywhere in the panel.
  const shown = await page.locator(CONTAINER).innerText();

  expect(shown).not.toContain("genie:genie");
  expect(shown).not.toContain("5432");
});

test("the Query, Form and Pacer panels are available", async ({ page }) => {
  test.setTimeout(180000);

  await page.goto("/");

  await expect(page.locator(CONTAINER)).toBeAttached(FIRST_PAINT);

  const trigger = page.getByRole("button", { name: /tanstack devtools/i });

  await expect(trigger).toBeVisible(FIRST_PAINT);
  await trigger.click();

  // Asserted together rather than in a loop: they are independent, and this
  // repository's lint refuses `await` inside a loop.
  await Promise.all(
    ["TanStack Query", "TanStack Form", "TanStack Pacer"].map((name) =>
      expect(page.getByRole("tab", { name })).toBeVisible()
    )
  );
});
