import { randomUUID } from "node:crypto";

import {
  createTenantContext,
  type ModuleRequestContext,
  principalFor,
  registerModuleRuntime,
  type TenantContext,
} from "@genie/core";
import { silentLogger } from "@genie/core/logging";
import { invoicesModule } from "@genie/module-invoices";
import {
  LIVE_UPLOADS,
  readDemoFile,
  readDemoJson,
  removeUploadRecords,
  runningTotals,
  toCents,
  withNewId,
} from "@genie/module-invoices/testing";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { expectNoAxeViolations } from "../support/axe.ts";
import { withDeploymentLock } from "../support/lock.ts";
import {
  allocationsOn,
  DATABASE_URL,
  FIRST_PAINT,
  fact,
  LEDGER_LOCK,
  LOCK_WAIT,
  onPhone,
  openInbox,
  PUBLIC_URL,
  sgd,
  signIn,
  type Upload,
  UPLOAD_TIMEOUT,
  uploadFiles,
} from "./dev-support.ts";
import { DEMO_ACCOUNT_EMAIL, DEV_MODULES } from "./global-setup.ts";

test.skip(
  !DEV_MODULES.has("invoices"),
  "This run does not compile the invoices module."
);

/**
 * The AC-7 review flow at the phone and the desktop viewport (Spec 7 AC-7, R-23 to R-28, R-37,
 * R-38, DEC-25, decision 11). The seven live uploads go through the real review screens on the
 * development run's disposable database, and after each step the four running totals are read
 * through the module's datasets and compared with `expected_live_running_totals.json`.
 *
 * The flow saves invoices and payments, so it takes the ledger lock that `invoices.spec.ts`,
 * `invoice-answers.spec.ts` and `documents.spec.ts` also take. Their seeded figures must not meet
 * a half-finished flow, and the readings of 03 and 05 would answer Possible duplicate while the
 * flow's payments exist. The records it saves are removed again before and after the flow, so a
 * finished run leaves the demo history as the seed wrote it.
 */

/** The name every upload of this spec carries, so its saved records can be found again. */
const UPLOAD_PREFIX = "review-";

/** A cold route's reading, from the file selection to the settled row. Measured 4.0 s warm. */
const READING_TIMEOUT = 30_000;

/** A save or Undo answers after its transaction commits. Measured under 2 s; 30 s covers a cold RPC route. */
const SAVE_TIMEOUT = 30_000;

/** The pdf.js worker and its text layer compile once per `next dev` (B9.4). */
const VIEWER_TIMEOUT = 30_000;

/**
 * The body's budget. One upload's worst case is two UPLOAD_TIMEOUTs: the choice waits for its
 * request, then a sent request waits for its response. The flow adds about 30 s.
 */
const FLOW_TIMEOUT = UPLOAD_TIMEOUT * 2 + 60_000;

const TEST_TIMEOUT = LOCK_WAIT + FLOW_TIMEOUT;

type LiveTotals = {
  readonly steps: readonly {
    readonly after_upload: string;
    readonly total_invoiced_sales: number;
    readonly total_collected: number;
    readonly outstanding: number;
    readonly overdue: number;
  }[];
};

// SAFETY: the demo pack's expected file is read verbatim and this spec owns its shape.
const LIVE_TOTALS = readDemoJson(
  "04_Demo_Guide/expected_live_running_totals.json"
) as LiveTotals;

/** The demo pack's live upload, found by its number in `LIVE_UPLOADS`. */
function liveUpload(number: string): string {
  const name = LIVE_UPLOADS.find((file) => file.startsWith(`${number}_`));

  if (name === undefined) {
    throw new Error(`The demo pack has no live upload ${number}.`);
  }

  return name;
}

/**
 * One project's own copy of a live upload: `withNewId` rewrites the trailer `/ID`, so the copy
 * has its own SHA-256 and the text layer the recordings answer for (decision 14).
 */
function copyOf(number: string, project: string): Upload {
  const file = liveUpload(number);

  return {
    name: `${UPLOAD_PREFIX}${project}-${randomUUID()}-${file}`,
    mimeType: "application/pdf",
    buffer: withNewId(readDemoFile(`03_Live_Upload_Documents/${file}`)),
  };
}

/** Upload 04 is the bytes of this run's 02 copy, under its own name. */
function duplicateOf(partial: Upload, project: string): Upload {
  return {
    name: `${UPLOAD_PREFIX}${project}-${randomUUID()}-${liveUpload("04")}`,
    mimeType: partial.mimeType,
    buffer: partial.buffer,
  };
}

/** One inbox row, read from whichever layout the viewport draws. */
function rowOf(page: Page, label: string) {
  return onPhone(page)
    ? page
        .getByRole("list", { name: "Documents" })
        .getByRole("listitem")
        .filter({ hasText: label })
    : page
        .getByRole("table", { name: "Documents" })
        .locator("tbody tr")
        .filter({ hasText: label });
}

/** Waits until the row of `upload` shows its status (R-37). */
async function expectStatus(
  page: Page,
  file: Upload,
  status: string,
  timeout = READING_TIMEOUT
): Promise<void> {
  await expect(
    rowOf(page, file.name).getByText(status, { exact: true })
  ).toBeVisible({ timeout });
}

/** Opens one row's review page. */
async function openReview(
  page: Page,
  file: Upload,
  title: string
): Promise<void> {
  await page
    .getByRole("link", { name: file.name, exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: title })
  ).toBeVisible(FIRST_PAINT);
}

/**
 * axe, then a full-page capture as evidence of the same screen (DEC-21, DEC-25). With a
 * `document`, both wait until that document's first page draws, so the capture shows the PDF
 * and not its loading Skeleton.
 */
async function capture(
  page: Page,
  testInfo: TestInfo,
  name: string,
  document?: string
): Promise<void> {
  const width = testInfo.project.name === "phone" ? 390 : 1440;

  if (document !== undefined) {
    // react-pdf sets the canvas style width only when the page has drawn.
    await expect(
      page
        .getByRole("region", { name: document })
        .locator('canvas[style*="width"]')
        .first()
    ).toBeVisible({ timeout: VIEWER_TIMEOUT });
  }

  await expectNoAxeViolations(page, name);
  await page.screenshot({
    path: testInfo.outputPath(`${name}-${width}-light.png`),
    fullPage: true,
  });
}

/** The totals of the step of `upload`, in integer cents as the guide prints them. */
function expectedTotals(file: string) {
  const step = LIVE_TOTALS.steps.find(
    (candidate) => candidate.after_upload === file
  );

  if (step === undefined) {
    throw new Error(`The guide has no running totals after ${file}.`);
  }

  return {
    invoicedCents: toCents(step.total_invoiced_sales),
    collectedCents: toCents(step.total_collected),
    outstandingCents: toCents(step.outstanding),
    overdueCents: toCents(step.overdue),
  };
}

let tenant: TenantContext | undefined;

let totals: ModuleRequestContext | undefined;

function tenantOf(): TenantContext {
  if (tenant === undefined) throw new Error("The test tenant was not built.");

  return tenant;
}

function totalsOf(): ModuleRequestContext {
  if (totals === undefined)
    throw new Error("The test principal was not built.");

  return totals;
}

/** The dev database, a tenant context and the demo account's real grants, once per worker. */
test.beforeAll(async () => {
  tenant = createTenantContext(
    { DATABASE_URL, PUBLIC_URL },
    silentLogger(),
    ["invoices"],
    undefined,
    "core"
  );
  registerModuleRuntime(tenant, [invoicesModule]);

  const { rows } = await tenant.db.$client.query<{ id: string }>(
    'select id from "user" where email = $1',
    [DEMO_ACCOUNT_EMAIL]
  );

  const userId = rows[0]?.id;

  if (userId === undefined) {
    throw new Error(`The demo account ${DEMO_ACCOUNT_EMAIL} was not seeded.`);
  }

  totals = {
    tenant,
    caller: principalFor({
      tenant,
      modules: [invoicesModule],
      userId,
      authenticated: true,
    }),
  };
});

test.afterAll(async () => {
  await tenant?.db.$client.end();
  tenant = undefined;
  totals = undefined;
});

/** After each step the four totals must equal the guide's step for that upload (AC-7). */
async function expectTotalsAfter(file: string): Promise<void> {
  expect(await runningTotals(totalsOf())).toEqual(expectedTotals(file));
}

test("reviews the seven live uploads to the running totals of the demo guide", async ({
  page,
}, testInfo) => {
  test.setTimeout(TEST_TIMEOUT);

  const project = testInfo.project.name;

  await page.setViewportSize(
    project === "phone"
      ? { width: 390, height: 844 }
      : { width: 1440, height: 900 }
  );

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      // A killed earlier run may have left saved rows; they would move every total.
      await removeUploadRecords(tenantOf(), UPLOAD_PREFIX);

      try {
        await signIn(page);
        await openInbox(page);

        // 01: an invoice without a due date waits for the person, who enters one (R-28).
        const invoice = copyOf("01", project);

        await uploadFiles(page, [invoice]);
        await expectStatus(page, invoice, "Needs your input");

        await openReview(page, invoice, "Review the invoice");

        // B9.3: the review of 01 has no accessibility defect before its save.
        await capture(page, testInfo, "review-invoice", invoice.name);

        // B9.4: the pdf.js worker loads under `next dev`, so the source text is marked.
        await page
          .getByRole("button", { name: "Show the source of Total" })
          .click();
        await expect(
          page
            .getByRole("region", { name: invoice.name })
            .locator("mark")
            .filter({ hasText: "5,000.00" })
            .first()
        ).toBeVisible({ timeout: VIEWER_TIMEOUT });

        // B5.7: one tap on the phone and one click on desktop check the radio after Total was
        // selected; selecting on pointer focus moved the radio and lost the first press.
        const enterDueDate = page.getByRole("radio", {
          name: "Enter a due date",
        });

        await (onPhone(page) ? enterDueDate.tap() : enterDueDate.click());

        const dueDate = page.getByLabel("Due date", { exact: true });
        await expect(dueDate).toBeVisible();

        // A pointer focus on the date input (a text field) matches :focus-visible, so it selects
        // its row at once; the press must still leave the input focused.
        await page
          .getByRole("button", { name: "Show the source of Total" })
          .click();
        await (onPhone(page) ? dueDate.tap() : dueDate.click());
        await expect(dueDate).toBeFocused();
        await expect(
          page.getByRole("button", { name: "Show the source of Due date" })
        ).toHaveAttribute("aria-pressed", "true");
        await dueDate.fill("2026-11-25");
        await page.getByRole("button", { name: "Save as unpaid" }).click();
        await expect(
          page.getByText(/INV-LIVE-001 saved as unpaid/)
        ).toBeVisible({ timeout: SAVE_TIMEOUT });

        await expectTotalsAfter("01_Invoice_Missing_Due_Date.pdf");

        await openInbox(page);

        // 02: one named invoice alone, within its open balance, so R-30 links it by itself.
        const partial = copyOf("02", project);

        await uploadFiles(page, [partial]);
        await expectStatus(page, partial, "Linked automatically");

        await expectTotalsAfter("02_Payment_Partial_Existing_Invoice.pdf");

        // 03: one payment covering two invoices waits for the person's split (R-30).
        const split = copyOf("03", project);

        await uploadFiles(page, [split]);
        await expectStatus(page, split, "Confirm the split");

        await openReview(page, split, "Review the payment");

        // S1: the review itself proposes the split, not only the inbox row.
        await expect(
          page.getByRole("heading", { level: 2, name: "Confirm the split" })
        ).toBeVisible();

        // B9.3: the payment review has no accessibility defect before its save.
        await capture(page, testInfo, "review-payment", split.name);

        await page.getByRole("button", { name: "Save the payment" }).click();
        await expect(page.getByText(/^Payment saved:/)).toBeVisible({
          timeout: SAVE_TIMEOUT,
        });

        await expectTotalsAfter("03_Payment_Covers_Two_Invoices.pdf");

        await openInbox(page);

        // 04: the same bytes again add nothing and one Duplicate row (R-23, R-33).
        const duplicate = duplicateOf(partial, project);

        await uploadFiles(page, [duplicate]);
        await expectStatus(page, duplicate, "Duplicate (nothing added)");
        await expect(rowOf(page, duplicate.name)).toContainText(
          `Same file as ${partial.name}`
        );

        await expectTotalsAfter("04_Duplicate_of_Partial_Payment.pdf");

        // 05: a payment matching no open balance is saved as unallocated (R-31).
        const unmatched = copyOf("05", project);

        await uploadFiles(page, [unmatched]);
        await expectStatus(page, unmatched, "No matching invoice");

        await openReview(page, unmatched, "Review the payment");
        await page.getByRole("button", { name: "Save as unallocated" }).click();
        await expect(page.getByText(/^Payment saved:/)).toBeVisible({
          timeout: SAVE_TIMEOUT,
        });

        await expectTotalsAfter("05_Payment_Unmatched.pdf");

        await openInbox(page);

        // 06: a paid receipt is one invoice, one payment and one link (R-33).
        const receipt = copyOf("06", project);

        await uploadFiles(page, [receipt]);
        await expectStatus(page, receipt, "Needs your input");

        await openReview(page, receipt, "Review the paid receipt");

        const savePaid = page.getByRole("button", { name: "Save as paid" });

        await page.getByRole("radio", { name: "Mark as unspecified" }).click();
        await expect(savePaid).not.toHaveAttribute("aria-disabled", "true");
        await savePaid.click();
        await expect(page.getByText(/saved as a paid receipt/)).toBeVisible({
          timeout: SAVE_TIMEOUT,
        });

        await expectTotalsAfter("06_Paid_Sales_Receipt.pdf");

        await openInbox(page);

        // 07: a purchase order is kept as a reference and changes no figure.
        const purchaseOrder = copyOf("07", project);

        await uploadFiles(page, [purchaseOrder]);
        await expectStatus(page, purchaseOrder, "Kept as a reference");

        await expectTotalsAfter("07_Purchase_Order_Not_Proof_of_Payment.pdf");

        // B9.2: Undo of 02's automatic link returns 3,000.00 to the payment and 5,200.00 to the
        // invoice, from the record page the real app draws (R-32, decision 9).
        const mounted = page.waitForResponse((response) =>
          response.url().endsWith("/api/session/activity")
        );

        await page.goto("/m/invoices/invoices");
        await expect(
          page.getByRole("heading", { level: 1, name: "Invoices" })
        ).toBeVisible(FIRST_PAINT);
        await mounted;
        await page
          .getByRole("link", { name: "INV-2026-09-03", exact: true })
          .click();
        await expect(
          page.getByRole("heading", { level: 1, name: "INV-2026-09-03" })
        ).toBeVisible(FIRST_PAINT);
        await expect(fact(page, "Outstanding")).toHaveText(sgd(2200));
        await expect(
          allocationsOn(page, "Payments").filter({
            hasText: "HF-SEP-FINAL-PART",
          })
        ).toHaveCount(1);

        // B9.3: the record page with its Undo, Change amount and Remove link has no defect.
        await capture(page, testInfo, "invoice-record");

        await page
          .getByRole("button", {
            name: "Undo the automatic link to HF-SEP-FINAL-PART",
          })
          .click();
        await expect(
          page.getByText("The link to HF-SEP-FINAL-PART is removed.")
        ).toBeVisible({ timeout: SAVE_TIMEOUT });

        // S2: the automatic row leaves the Payments card, not only its toast.
        await expect(
          allocationsOn(page, "Payments").filter({
            hasText: "HF-SEP-FINAL-PART",
          })
        ).toHaveCount(0);
        await expect(fact(page, "Outstanding")).toHaveText(sgd(5200));
      } finally {
        await removeUploadRecords(tenantOf(), UPLOAD_PREFIX);
      }
    },
    LOCK_WAIT
  );
});
