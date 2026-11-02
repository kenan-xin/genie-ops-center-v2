import { randomUUID } from "node:crypto";

import { createTenantContext, type TenantContext } from "@genie/core";
import { silentLogger } from "@genie/core/logging";
import { removeUploadRecords } from "@genie/module-invoices/testing";
import { expect, test, type Page } from "@playwright/test";

import { selectedModuleIds } from "../../src/modules.ts";
import { RECEIVABLES_OVERVIEW } from "../../testing/receivables-overview.ts";
import { withDeploymentLock } from "../support/lock.ts";
import { openNavigation } from "../support/shell.ts";
import {
  allocationsOn,
  copyOf,
  DATABASE_URL,
  expectStatus,
  FIRST_PAINT,
  fact,
  LEDGER_LOCK,
  liveUpload,
  LOCK_WAIT,
  onPhone,
  openInbox,
  openReview,
  PUBLIC_URL,
  sgd,
  signIn,
  type Upload,
  UPLOAD_TIMEOUT,
  uploadFiles,
} from "./dev-support.ts";
import { DEV_MODULES } from "./global-setup.ts";

test.skip(
  !["invoices", "analytics", "slides", "placeholder"].every((id) =>
    DEV_MODULES.has(id)
  ),
  "The demo script needs the three Section 7 modules and the recordings' default selection."
);

/**
 * The ten steps of the Section 7 demo script, in order, on the development run's seeded demo
 * deployment with the recorded test model (Spec 7 AC-12, R-59, R-60, DEC-25). The steps and what
 * each must show come from the demo pack's own order (S7-15, `phase-11.md`).
 *
 * The siloed specs prove each screen alone. This one carries the ledger from step to step, so a
 * page that reads a stale or partial ledger after a save shows here. It saves records, so it holds
 * the ledger lock for its whole run, and it removes its saved records before the flow and after it.
 */

/** Every upload of this spec carries this name, so its saved records can be found again. */
const UPLOAD_PREFIX = "demo-script-";

/** A save answers after its transaction commits. Measured under 2 s; 30 s covers a cold RPC route. */
const SAVE_TIMEOUT = 30_000;

/**
 * The lock's queue, then the body: the cold pages (the shell, Invoices, Payments, Dashboards: four
 * first paints), one upload's worst case (two UPLOAD_TIMEOUTs: request, then response; later uploads
 * reuse the warm route), and about 120 s of seven readings, reviews and saves.
 */
const TEST_TIMEOUT =
  LOCK_WAIT + FIRST_PAINT.timeout * 4 + UPLOAD_TIMEOUT * 2 + 120_000;

/** The guide's totals after upload 07 (`expected_live_running_totals.json`, step 7). */
const FINAL = {
  invoiced: 243_200,
  collected: 210_472,
  outstanding: 34_950,
  overdue: 16_100,
} as const;

/** The Section 7 workspace entries the demo account sees with every Section 7 role (R-59). */
const SECTION_7_ENTRIES = [
  "Documents",
  "Invoices",
  "Payments",
  "Dashboards",
  "Slides",
] as const;

let tenant: TenantContext | undefined;

function tenantOf(): TenantContext {
  if (tenant === undefined) throw new Error("The test tenant was not built.");

  return tenant;
}

test.beforeAll(() => {
  tenant = createTenantContext(
    { DATABASE_URL, PUBLIC_URL },
    silentLogger(),
    selectedModuleIds,
    undefined,
    "core"
  );
});

test.afterAll(async () => {
  await tenant?.db.$client.end();
  tenant = undefined;
});

/** The four figures of the Invoices list strip, in the guide's dollars. */
async function expectInvoiceStrip(
  page: Page,
  figures: {
    readonly invoiced: number;
    readonly outstanding: number;
    readonly overdue: number;
    readonly count: number;
  }
): Promise<void> {
  await expect(fact(page, "Invoiced")).toHaveText(sgd(figures.invoiced));
  await expect(fact(page, "Outstanding")).toHaveText(sgd(figures.outstanding));
  await expect(fact(page, "Overdue")).toHaveText(sgd(figures.overdue));
  await expect(fact(page, "Invoices")).toHaveText(String(figures.count));
}

/** Opens a list page by its address, as step 3 does: a review page on a phone has no menu. */
async function openList(
  page: Page,
  path: string,
  heading: string
): Promise<void> {
  await page.goto(path);
  await expect(
    page.getByRole("heading", { level: 1, name: heading })
  ).toBeVisible(FIRST_PAINT);
}

/** Opens a workspace entry from the shell's navigation, as the presenter does. */
async function openEntry(page: Page, entry: string): Promise<void> {
  await (
    await openNavigation(page)
  )
    .getByRole("navigation", { name: "Workspace", exact: true })
    .getByRole("link", { name: entry, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: entry })
  ).toBeVisible(FIRST_PAINT);
}

test("the demo account runs the ten demo-script steps on the seeded demo deployment", async ({
  page,
}, testInfo) => {
  test.setTimeout(TEST_TIMEOUT);

  const label = `${UPLOAD_PREFIX}${testInfo.project.name}`;

  /** Step 4's copy of 02: step 6 uploads its bytes again. */
  let partial: Upload | undefined;

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      // A killed earlier run may have left saved rows; they would move every total.
      await removeUploadRecords(tenantOf(), UPLOAD_PREFIX);

      try {
        await test.step("1. sign in as the demo account", async () => {
          await signIn(page);
          await page.goto("/");

          const navigation = await openNavigation(page);

          await expect(navigation).toContainText("E2E Demo", FIRST_PAINT);

          const workspace = navigation.getByRole("navigation", {
            name: "Workspace",
            exact: true,
          });

          await Promise.all(
            SECTION_7_ENTRIES.map((entry) =>
              expect(
                workspace.getByRole("link", { name: entry, exact: true })
              ).toBeVisible()
            )
          );

          if (onPhone(page)) await page.keyboard.press("Escape");
        });

        await test.step("2. open Invoices, then INV-2026-09-04", async () => {
          await openEntry(page, "Invoices");
          await expectInvoiceStrip(page, {
            invoiced: 236_400,
            outstanding: 41_200,
            overdue: 27_350,
            count: 36,
          });

          await page
            .getByRole("link", { name: "INV-2026-09-04", exact: true })
            .click();
          await expect(
            page.getByRole("heading", { level: 1, name: "INV-2026-09-04" })
          ).toBeVisible(FIRST_PAINT);
          await expect(fact(page, "Due date")).toHaveText("30 Sept 2026");
          await expect(
            page.getByRole("region", { name: "Figures" })
          ).toContainText("Overdue · 27 days");

          const href = await page
            .getByRole("link", {
              name: "Open the PDF (source document, opens in a new tab)",
            })
            .getAttribute("href");

          const pdf = await page.request.get(
            new URL(href ?? "", page.url()).toString()
          );

          expect(pdf.status()).toBe(200);
          expect(pdf.headers()["content-type"]).toContain("application/pdf");
        });

        await test.step("3. upload 01, enter its due date and save it", async () => {
          const invoice = copyOf("01", label);

          await openInbox(page);
          await uploadFiles(page, [invoice]);
          await expectStatus(page, invoice, "Needs your input");
          await openReview(page, invoice, "Review the invoice");

          // Below 1024 px the review shows one pane at a time; the fields pane is the default.
          const enterDueDate = page.getByRole("radio", {
            name: "Enter a due date",
          });

          await (onPhone(page) ? enterDueDate.tap() : enterDueDate.click());
          await page
            .getByLabel("Due date", { exact: true })
            .fill("25 Nov 2026");
          await page.getByRole("button", { name: "Save as unpaid" }).click();
          await expect(
            page.getByText(/INV-LIVE-001 saved as unpaid/)
          ).toBeVisible({ timeout: SAVE_TIMEOUT });

          // The list page itself, not only the datasets, reads the saved invoice (running totals 1).
          // On a phone the review shows a back bar, not the shell's menu, so the list opens by URL.
          await openList(page, "/m/invoices/invoices", "Invoices");
          await expectInvoiceStrip(page, {
            invoiced: 241_400,
            outstanding: 46_200,
            overdue: 27_350,
            count: 37,
          });
          await page
            .getByRole("link", { name: "INV-LIVE-001", exact: true })
            .click();
          await expect(
            page.getByRole("heading", { level: 1, name: "INV-LIVE-001" })
          ).toBeVisible(FIRST_PAINT);
          await expect(fact(page, "Due date")).toHaveText("25 Nov 2026");

          const figures = page.getByRole("region", { name: "Figures" });

          // The due date's source note sits beside its value, outside the `dd`.
          await expect(figures).toContainText("Entered by a person");
          await expect(figures).toContainText("Open");
          await expect(figures).not.toContainText("Overdue");
        });

        await test.step("4. upload 02, which links itself to INV-2026-09-03", async () => {
          partial = copyOf("02", label);

          await openInbox(page);
          await uploadFiles(page, [partial]);
          await expectStatus(page, partial, "Linked automatically");
        });

        await test.step("5. upload 03, confirm the split and save one payment", async () => {
          const split = copyOf("03", label);

          await uploadFiles(page, [split]);
          await expectStatus(page, split, "Confirm the split");
          await openReview(page, split, "Review the payment");
          await expect(
            page.getByRole("heading", { level: 2, name: "Confirm the split" })
          ).toBeVisible();
          await page.getByRole("button", { name: "Save the payment" }).click();
          await expect(page.getByText(/^Payment saved:/)).toBeVisible({
            timeout: SAVE_TIMEOUT,
          });

          // One payment with two links, not two payments of 8,250.00 (scenario 03).
          await openList(page, "/m/invoices/payments", "Payments");
          await expect(fact(page, "Collected")).toHaveText(sgd(206_450));
          await expect(fact(page, "Payments")).toHaveText("32");

          const bundle = page.getByRole("link", {
            name: "OR-AUG-SEP-BUNDLE",
            exact: true,
          });

          await expect(bundle).toHaveCount(1);
          await bundle.click();
          await expect(
            page.getByRole("heading", { level: 1, name: "OR-AUG-SEP-BUNDLE" })
          ).toBeVisible(FIRST_PAINT);
          await expect(fact(page, "Amount")).toHaveText(sgd(8250));
          await expect(fact(page, "Allocated")).toHaveText(sgd(8250));

          const links = allocationsOn(page, "Invoices");

          await expect(links).toHaveCount(2);
          await expect(
            links.filter({ hasText: "INV-2026-08-04" })
          ).toContainText(sgd(4050));
          await expect(
            links.filter({ hasText: "INV-2026-09-04" })
          ).toContainText(sgd(4200));
        });

        await test.step("6. upload 04, the same bytes as 02, which adds nothing", async () => {
          if (partial === undefined) throw new Error("Step 4 did not run.");

          const duplicate: Upload = {
            ...partial,
            name: `${label}-${randomUUID()}-${liveUpload("04")}`,
          };

          await openInbox(page);
          await uploadFiles(page, [duplicate]);
          await expectStatus(page, duplicate, "Duplicate (nothing added)");
        });

        await test.step("7. upload 05, 06 and 07, save each, and read the final totals", async () => {
          const unmatched = copyOf("05", label);

          await uploadFiles(page, [unmatched]);
          await expectStatus(page, unmatched, "No matching invoice");
          await openReview(page, unmatched, "Review the payment");
          await page
            .getByRole("button", { name: "Save as unallocated" })
            .click();
          await expect(page.getByText(/^Payment saved:/)).toBeVisible({
            timeout: SAVE_TIMEOUT,
          });

          const receipt = copyOf("06", label);

          await openInbox(page);
          await uploadFiles(page, [receipt]);
          await expectStatus(page, receipt, "Needs your input");
          await openReview(page, receipt, "Review the paid receipt");

          const savePaid = page.getByRole("button", { name: "Save as paid" });

          await page
            .getByRole("radio", { name: "Mark as unspecified" })
            .click();
          await expect(savePaid).not.toHaveAttribute("aria-disabled", "true");
          await savePaid.click();
          await expect(page.getByText(/saved as a paid receipt/)).toBeVisible({
            timeout: SAVE_TIMEOUT,
          });

          const purchaseOrder = copyOf("07", label);

          await openInbox(page);
          await uploadFiles(page, [purchaseOrder]);
          await expectStatus(page, purchaseOrder, "Kept as a reference");

          // The pages, not only the datasets, read the guide's final totals (running totals 7).
          await openList(page, "/m/invoices/invoices", "Invoices");
          await expectInvoiceStrip(page, {
            invoiced: FINAL.invoiced,
            outstanding: FINAL.outstanding,
            overdue: FINAL.overdue,
            count: 38,
          });

          await openList(page, "/m/invoices/payments", "Payments");
          await expect(fact(page, "Collected")).toHaveText(
            sgd(FINAL.collected)
          );
          await expect(fact(page, "Payments")).toHaveText("34");

          await openList(page, "/m/analytics/dashboards", "Dashboards");
          await page
            .getByRole("link", { name: RECEIVABLES_OVERVIEW.name, exact: true })
            .click();
          await expect(
            page.getByRole("heading", {
              level: 1,
              name: RECEIVABLES_OVERVIEW.name,
            })
          ).toBeVisible(FIRST_PAINT);

          const panels = [
            ["Invoiced sales", FINAL.invoiced],
            ["Collections", FINAL.collected],
            ["Outstanding", FINAL.outstanding],
            ["Overdue", FINAL.overdue],
          ] as const;

          await Promise.all(
            panels.map(([title, dollars]) =>
              expect(
                page
                  .getByRole("figure", { name: title })
                  .getByText(sgd(dollars), { exact: true })
              ).toBeVisible(FIRST_PAINT)
            )
          );

          // Steps 8 to 10 replay recordings made on the baseline ledger (phase-11.md, decisions).
          await removeUploadRecords(tenantOf(), UPLOAD_PREFIX);
        });

        // Steps 8 to 10 follow in the next task of S7-15 (phase-11.md).
      } finally {
        await removeUploadRecords(tenantOf(), UPLOAD_PREFIX);
      }
    },
    LOCK_WAIT
  );
});
