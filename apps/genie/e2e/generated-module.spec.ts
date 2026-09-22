import { expect, test } from "@playwright/test";

/**
 * A module the generator wrote, proved in a browser at both viewports (R-30,
 * AC-7).
 *
 * These cases need a stack whose image carries a generated module, which the
 * ordinary end-to-end stack does not. `GENIE_MODULE_UNDER_TEST` names that module
 * and the file skips without it, so an ordinary run reports three skips rather
 * than a pass. The run that does prove this is
 * `tools/generators/scripts/prove-generated-module.ts`, which builds the image,
 * sets the variable and fails if these cases do not execute.
 *
 * The proof is refusal. The Section 0 stub grants one key and it belongs to
 * another module, so every entry a generated module declares is denied. The
 * application's page loader answers `can()` and returns its own denied response;
 * nothing the module would have rendered appears.
 */
const id = process.env.GENIE_MODULE_UNDER_TEST;

/** The label the generator derives from an id, which is what navigation shows. */
const displayName =
  id === undefined
    ? ""
    : id.charAt(0).toUpperCase() + id.slice(1).replaceAll("-", " ");

test.skip(
  id === undefined,
  "set GENIE_MODULE_UNDER_TEST to the generated module's id"
);

test("the generated module's workspace page is refused", async ({ page }) => {
  await page.goto(`/m/${id}`);

  await expect(page.getByTestId("permission-denied")).toBeVisible();

  // The refused page reveals nothing the module would have rendered.
  await expect(page.getByText("No records yet.")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
});

test("the generated module's admin page is refused", async ({ page }) => {
  await page.goto(`/admin/m/${id}`);

  await expect(page.getByTestId("permission-denied")).toBeVisible();
  await expect(page.getByText(/records\./)).toHaveCount(0);
});

test("its navigation entry leads to the refusal, not to a missing page", async ({
  page,
}) => {
  await page.goto("/");

  const nav = page.getByRole("navigation", { name: "Modules" });
  const link = nav.getByRole("link", { name: displayName, exact: true });

  await expect(link).toBeVisible();

  await link.click();

  await expect(page.getByTestId("permission-denied")).toBeVisible();
});
