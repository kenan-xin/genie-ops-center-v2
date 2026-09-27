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
 * The proof is refusal. Sign-in arrives with S2-04, so the browser is anonymous
 * and the real evaluator grants it nothing: every entry a generated module
 * declares is omitted from navigation and its route still refuses. The
 * application's page loader answers `can()` and returns its own denied response;
 * nothing the module would have rendered appears. The generated module's
 * authorized read through a real role assignment is proved by its own
 * integration suite.
 *
 * A compiled module with no `tenant_module` row reads as disabled (R-5), so
 * before its own permission check ever runs, R-8 would refuse it at the proxy
 * with `module-disabled` instead. Global setup seeds an enabled row for this
 * module (stand-in for R-20, same as it does for `placeholder`) so the refusal
 * these cases see is the `can()` denial, not that earlier module gate; each case
 * below also checks for the `module-disabled` message, so a regression of that
 * seed shows up here rather than masquerading as a pass.
 */
const id = process.env.GENIE_MODULE_UNDER_TEST;

/** `packages/core/src/lib/errors/index.ts`'s fixed message for `module-disabled`. */
const MODULE_DISABLED_MESSAGE =
  "That module is switched off for this deployment.";

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

  // The refusal is `can()`'s, not R-8's module-disabled gate landing first.
  await expect(page.getByText(MODULE_DISABLED_MESSAGE)).toHaveCount(0);

  // The refused page reveals nothing the module would have rendered.
  await expect(page.getByText("No records yet.")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
});

test("the generated module's admin page is refused", async ({ page }) => {
  await page.goto(`/admin/m/${id}`);

  await expect(page.getByTestId("permission-denied")).toBeVisible();
  await expect(page.getByText(MODULE_DISABLED_MESSAGE)).toHaveCount(0);
  await expect(page.getByText(/records\./)).toHaveCount(0);
});

test("its navigation entry is omitted and its route still refuses", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("link", { name: displayName, exact: true })
  ).toHaveCount(0);

  await page.goto(`/m/${id}`);

  await expect(page.getByTestId("permission-denied")).toBeVisible();
  await expect(page.getByText(MODULE_DISABLED_MESSAGE)).toHaveCount(0);
});
