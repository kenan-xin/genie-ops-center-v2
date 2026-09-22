import { expect, test } from "@playwright/test";

/**
 * The development panels, in a real browser.
 *
 * The ordinary end-to-end run drives the built image, where the devtools are
 * excluded on purpose, so it can never show a panel. This file is the other
 * half of that proof and runs against `next dev`.
 *
 * STATUS: red. The mount runs and the devtools shell renders its container into
 * the document, and the shell then renders nothing into it. Its `mount()`
 * resolves a dynamic import and swallows every failure in a `.catch`, so no
 * error reaches the console, no request fails, and the container simply stays
 * empty. Versions: @tanstack/react-devtools 0.10.12 with core 0.14.2, Next
 * 16.3.5, React 19.3. Reproduced with and without `ssr: false`. The assertions
 * below are what the acceptance clause asks for and they are written against
 * the documented interface, not against a rendering anyone has seen here, so
 * treat their selectors as unverified until the shell renders once.
 *
 * Do not weaken these into a check that the empty container exists. That would
 * turn a known failure into a passing gate.
 */

/** The shell's own container, which is all that renders today. */
const CONTAINER = 'body > div[style*="absolute"]';

test("the devtools open and report this deployment truthfully", async ({
  page,
}) => {
  await page.goto("/");

  // The boundary really mounted: the shell put its container in the document.
  // This is a precondition, not the acceptance, and the assertions below are
  // what the clause actually requires.
  await expect(page.locator(CONTAINER)).toBeAttached();

  const trigger = page.getByRole("button", { name: /tanstack devtools/i });

  await expect(trigger).toBeVisible();
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
  await page.goto("/");

  await expect(page.locator(CONTAINER)).toBeAttached();

  const trigger = page.getByRole("button", { name: /tanstack devtools/i });

  await expect(trigger).toBeVisible();
  await trigger.click();

  // Asserted together rather than in a loop: they are independent, and this
  // repository's lint refuses `await` inside a loop.
  await Promise.all(
    ["TanStack Query", "TanStack Form", "TanStack Pacer"].map((name) =>
      expect(page.getByRole("tab", { name })).toBeVisible()
    )
  );
});
