import { expect, test } from "@playwright/test";

/**
 * A module the generator wrote, proved in a browser at both viewports (R-30,
 * AC-7). The stack this runs against carries the generated module in its image;
 * `GENIE_MODULE_UNDER_TEST` names it, and the run fails rather than passing
 * quietly when it is unset, because a spec that silently tests nothing is worse
 * than a missing one.
 *
 * The proof is refusal. The Section 0 stub grants one key and it belongs to
 * another module, so every entry a generated module declares is denied. The app's
 * page loader answers `can()` and returns its own denied response; nothing the
 * module would have rendered appears.
 */
const id = process.env.GENIE_MODULE_UNDER_TEST;

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
  const link = nav.getByRole("link", { name: "Generated proof", exact: true });

  await expect(link).toBeVisible();

  await link.click();

  await expect(page.getByTestId("permission-denied")).toBeVisible();
});
