import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { expectNoAxeViolations } from "../support/axe.ts";
import { withDeploymentLock } from "../support/lock.ts";
import {
  FIRST_PAINT,
  hideDevelopmentWidgets,
  signInAs,
} from "./ask-support.ts";
import {
  closeDashboardDatabase,
  resetReceivablesOverview,
} from "./dashboard-support.ts";
import { LEDGER_LOCK, LOCK_WAIT, onPhone, sgd } from "./dev-support.ts";
import { DEMO_ACCOUNT_EMAIL, DEV_MODULES } from "./global-setup.ts";

test.skip(
  !DEV_MODULES.has("analytics") || !DEV_MODULES.has("invoices"),
  "The Receivables overview reads the invoices datasets."
);

/**
 * Dashboard filters in the page address and saved views on the running app (Spec 7 AC-15,
 * S7-46, S7-47): what a real reload, a fresh page and the server's open order show. The demo
 * ledger gives Harbor Foods $41,400 of the $236,400 invoiced, and $14,600 of it overdue.
 */

const ALL = sgd(236_400);

const HARBOR = sgd(41_400);

const HARBOR_OVERDUE = sgd(14_600);

const invoiced = (page: Page) =>
  page.getByRole("figure", { name: "Invoiced sales" });

async function expectInvoiced(page: Page, amount: string): Promise<void> {
  await expect(invoiced(page).getByText(amount, { exact: true })).toBeVisible(
    FIRST_PAINT
  );
}

/** The bar's filters as a person reads them: the controls on a desktop, the chips on a phone. */
async function expectBar(page: Page, overdue: boolean): Promise<void> {
  if (onPhone(page)) {
    const chips = page.getByRole("list", { name: "Applied filters" });

    await expect(
      chips.getByText("Harbor Foods", { exact: true })
    ).toBeVisible();
    await expect(chips.getByText("Overdue", { exact: true })).toHaveCount(
      overdue ? 1 : 0
    );

    return;
  }

  await expect(page.getByLabel("Customer: Harbor Foods")).toBeVisible();

  const toggle = page.getByRole("switch", { name: "Overdue" });

  await (overdue
    ? expect(toggle).toBeChecked()
    : expect(toggle).toHaveCount(0));
}

/** On a phone View and Filters are one segmented control above the chips (czjw.159). */
const viewAndFilters = (page: Page) =>
  page.getByRole("group", { name: "View and filters" });

const filtersButton = (page: Page) =>
  viewAndFilters(page).getByRole("button", { name: /^Filters/ });

/** On a phone the filters sit in the Filters sheet; on a desktop in the bar. */
async function inFilters(page: Page, pick: () => Promise<void>) {
  if (!onPhone(page)) return pick();

  await filtersButton(page).click();
  await pick();
  await page.getByRole("button", { name: "Show results" }).click();
}

const pickHarbor = (page: Page) =>
  inFilters(page, async () => {
    await page.getByLabel("Customer: All").filter({ visible: true }).click();
    await page.getByRole("option", { name: "Harbor Foods" }).click();
  });

const addOverdue = (page: Page) =>
  inFilters(page, async () => {
    if (onPhone(page)) {
      await page.getByRole("button", { name: "Overdue", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "Add filter" }).click();
      await page.getByRole("menuitem", { name: "Overdue" }).click();
    }

    await page
      .getByRole("switch", { name: "Overdue" })
      .filter({ visible: true })
      .click();
  });

/** Runs one view-menu action: a menu item from 768 px, a row of the Views sheet below. */
async function viewAction(page: Page, current: string, action: RegExp) {
  await (onPhone(page) ? viewAndFilters(page) : page)
    .getByRole("button", { name: `View: ${current}` })
    .click();
  await page
    .getByRole(onPhone(page) ? "button" : "menuitem", { name: action })
    .click();
}

/** One saved dashboard change, waited for so the next cold load reads it. */
const changeSaved = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.url().includes("/api/rpc/analytics/changeDashboard") &&
      response.ok()
  );

/** Signs in, resets the dashboard and opens it by its plain path; resets it again after. */
async function onDashboard(
  page: Page,
  run: (path: string) => Promise<void>
): Promise<void> {
  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      const path = `/m/analytics/dashboards/${await resetReceivablesOverview()}`;

      try {
        await signInAs(page, DEMO_ACCOUNT_EMAIL);
        await page.goto(path);
        await expectInvoiced(page, ALL);
        await run(path);
      } finally {
        await resetReceivablesOverview();
      }
    },
    LOCK_WAIT
  );
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({
    path: testInfo.outputPath(`dashboard-filters-${name}.png`),
    fullPage: true,
  });
}

// The development widgets float over the bar's buttons in development.
test.beforeEach(({ page }) => hideDevelopmentWidgets(page));

test.afterAll(closeDashboardDatabase);

test("two filters survive a reload and open the same view from the copied link", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 180_000);

  await onDashboard(page, async () => {
    if (onPhone(page)) {
      // The View half of the segmented control opens the Views sheet.
      await viewAndFilters(page)
        .getByRole("button", { name: "View: Dashboard filters" })
        .click();
      await expect(page.getByRole("dialog", { name: "Views" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "Views" })).toHaveCount(0);
    }

    await pickHarbor(page);
    await expectInvoiced(page, HARBOR);
    await addOverdue(page);
    await expectInvoiced(page, HARBOR_OVERDUE);
    await expectBar(page, true);

    // The filters live in the address, not in the stored dashboard (S7-46).
    await expect(page).toHaveURL(
      /[?&]f\.customerName=Harbor(\+|%20)Foods(&|$)/
    );
    await expect(page).toHaveURL(/[?&]f\.overdue=1(&|$)/);
    await expect(
      page.getByText("Not saved as default").filter({ visible: true })
    ).toBeVisible();

    await page.reload();
    await expectInvoiced(page, HARBOR_OVERDUE);
    await expectBar(page, true);

    const other = await page.context().newPage();

    await hideDevelopmentWidgets(other);
    await other.goto(page.url());
    await expectInvoiced(other, HARBOR_OVERDUE);
    await expectBar(other, true);
    await other.close();
  });
});

test("Save as default opens the saved filters from the plain path", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + 180_000);

  await onDashboard(page, async (path) => {
    await pickHarbor(page);
    await expectInvoiced(page, HARBOR);

    const unsaved = page.getByText("Not saved as default");

    await expect(unsaved.filter({ visible: true })).toBeVisible();
    await page.getByRole("button", { name: "Save as default" }).click();
    await expect(unsaved).toHaveCount(0);
    // The filters now live in the stored dashboard, so the address holds none.
    await expect(page).not.toHaveURL(/[?&]f\./);

    await page.goto(path);
    await expectInvoiced(page, HARBOR);
    await expectBar(page, false);
    await expect(unsaved).toHaveCount(0);
  });
});

test("an updated view made the default opens from the plain path", async ({
  page,
}, testInfo) => {
  test.setTimeout(LOCK_WAIT + 180_000);

  const name = "Harbor watch";

  await onDashboard(page, async (path) => {
    await pickHarbor(page);
    await expectInvoiced(page, HARBOR);

    await viewAction(page, "Dashboard filters", /^Save as view/);

    const dialog = page.getByRole("dialog", { name: "Save as view" });

    await dialog.getByRole("textbox", { name: "Name" }).fill(name);
    await dialog.getByRole("button", { name: "Save view" }).click();
    await expect(
      page.getByRole("button", { name: `View: ${name}` })
    ).toBeVisible();
    await expect(page).toHaveURL(/[?&]view=v\d+(&|$)/);

    await addOverdue(page);
    await expectInvoiced(page, HARBOR_OVERDUE);

    const changed = page.getByText("Changed", { exact: true });

    await expect(changed.filter({ visible: true })).toBeVisible();
    // The pointer still rests on the set Overdue switch: its hover keeps 4.5:1 (czjw.136).
    await expectNoAxeViolations(page, "a changed view");
    await page.getByRole("button", { name: "Update view" }).click();
    await expect(changed).toHaveCount(0);

    const saved = changeSaved(page);

    await viewAction(page, name, /^Make default/);
    await saved;

    await page.goto(path);
    await expect(
      page.getByRole("button", { name: `View: ${name}` })
    ).toBeVisible(FIRST_PAINT);
    await expectInvoiced(page, HARBOR_OVERDUE);
    await expectBar(page, true);
    await expect(changed).toHaveCount(0);
    await screenshot(page, testInfo, `default-view-${testInfo.project.name}`);
  });
});

test("Clear filters keeps the focus on the filter bar", async ({ page }) => {
  test.setTimeout(LOCK_WAIT + 180_000);

  await onDashboard(page, async () => {
    await pickHarbor(page);
    await expectInvoiced(page, HARBOR);

    if (onPhone(page)) {
      await filtersButton(page).click();

      const show = page.getByRole("button", { name: "Show results" });

      await expect(show).toBeVisible();
      await page.getByRole("button", { name: "Clear all" }).click();
      // Clear all disables itself, so the focus goes to Show, not to the body (6wz1.98).
      await expect(show).toBeFocused();
      await show.click();
      await expect(filtersButton(page)).toBeFocused();
    } else {
      await page.getByRole("button", { name: "Clear filters" }).click();
      // Clear filters unmounts itself, so the focus goes to the first control (6wz1.98).
      await expect(
        page.getByRole("combobox", { name: /^Date:/ }).filter({ visible: true })
      ).toBeFocused();
    }

    await expectInvoiced(page, ALL);
  });
});
