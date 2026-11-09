import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { createTenantContext, type TenantContext } from "@genie/core";
import { silentLogger } from "@genie/core/logging";
import { removeUploadRecords } from "@genie/module-invoices/testing";
import { readPptx } from "@genie/module-slides/testing";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { selectedModuleIds } from "../../src/modules.ts";
import {
  ANALYTICS_CHAT_DASHBOARD,
  ANALYTICS_CHAT_MESSAGE,
} from "../../testing/analytics-chat.ts";
import { RECEIVABLES_OVERVIEW } from "../../testing/receivables-overview.ts";
import { MONTHLY_DECK } from "../../testing/slides-chat.ts";
import { withDeploymentLock } from "../support/lock.ts";
import { openNavigation } from "../support/shell.ts";
import {
  askQuestion,
  hideDevelopmentWidgets,
  signInAs,
} from "./ask-support.ts";
import {
  closeDashboardDatabase,
  resetChatDashboard,
} from "./dashboard-support.ts";
import {
  copyOf,
  DATABASE_URL,
  expectBundleDesk,
  expectPageDrawn,
  expectStatus,
  FIRST_PAINT,
  fact,
  goToField,
  LEDGER_LOCK,
  liveUpload,
  LOCK_WAIT,
  onPhone,
  openDetails,
  openInbox,
  openReview,
  saveButton,
  PUBLIC_URL,
  sgd,
  signIn,
  type Upload,
  UPLOAD_TIMEOUT,
  uploadFiles,
} from "./dev-support.ts";
import {
  ANALYTICS_PEOPLE,
  DEV_MODULES,
  INVOICE_ASK_PEOPLE,
  SLIDES_PEOPLE,
} from "./global-setup.ts";
import { closeSlidesDatabase, removeOwnDecks } from "./slides-support.ts";
import {
  closeSurfaceDatabase,
  handOverWholeDeck,
  openSurfaceAgent,
} from "./surface-support.ts";

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
 * The lock's queue, then the body: the cold pages (the shell, Invoices, Payments, Dashboards, Ask,
 * a record, Slides, a deck: eight first paints), one upload's worst case (two UPLOAD_TIMEOUTs:
 * request, then response; later uploads reuse the warm route), and about 180 s of seven readings,
 * reviews and saves, three chat answers, present mode and the export.
 */
const TEST_TIMEOUT =
  LOCK_WAIT + FIRST_PAINT.timeout * 8 + UPLOAD_TIMEOUT * 2 + 180_000;

/** The overdue question of the demo pack's chatbot prompts, as the Ask recording holds it. */
const OVERDUE_QUESTION =
  "Which customers currently have overdue invoices? Show the unpaid amount, due date and days overdue, with sources.";

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
  await closeDashboardDatabase();
  await closeSlidesDatabase();
  await closeSurfaceDatabase();
});

// The development widgets float over the chat's Send in development.
test.beforeEach(({ page }) => hideDevelopmentWidgets(page));

/** A tap on the phone project, where a fixed bar or the Ask bubble can cover a control. */
async function activate(page: Page, target: Locator): Promise<void> {
  await (onPhone(page) ? target.tap() : target.click());
}

/**
 * Sends a message to the Dashboards agent of the open dashboard (R-42). On a phone its panel covers
 * part of the page, so it closes after Send and the run goes on.
 */
async function sendToDashboardsAgent(
  page: Page,
  message: string
): Promise<void> {
  const chat = await openSurfaceAgent(page, "Dashboards agent");

  await chat
    .getByRole("textbox", { name: "Message", exact: true })
    .fill(message);
  await activate(page, chat.getByRole("button", { name: "Send" }));

  if (onPhone(page)) {
    await chat.getByRole("button", { name: "Close the agent panel" }).tap();
  }
}

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
          // czjw.84: the PDF draws in the page.
          await expectPageDrawn(page);
          await openDetails(page);
          await expect(fact(page, "Due date")).toHaveText("30 Sept 2026");
          await expect(
            page.getByRole("region", { name: "Figures" })
          ).toContainText("Overdue · 27 days");
        });

        await test.step("3. upload 01, enter its due date and save it", async () => {
          const invoice = copyOf("01", label);

          await openInbox(page);
          await uploadFiles(page, [invoice]);
          await expectStatus(page, invoice, "Needs your input");
          await openReview(page, invoice, "Review the invoice");

          // Below 1024 px the review shows one field at a time, so the pager goes to the due date.
          await goToField(page, "Due date");

          const enterDueDate = page.getByRole("radio", {
            name: "Enter a due date",
          });

          await (onPhone(page) ? enterDueDate.tap() : enterDueDate.click());
          await page
            .getByLabel("Due date", { exact: true })
            .fill("25 Nov 2026");
          await (await saveButton(page, "Save as unpaid")).click();
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
          await openDetails(page);
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
          await goToField(page, "Confirm the split");
          await expect(
            page.getByRole("heading", { level: 2, name: "Confirm the split" })
          ).toBeVisible();
          await (await saveButton(page, "Save the payment")).click();
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
          await expectBundleDesk(page);
          await expect(fact(page, "Amount")).toHaveText(sgd(8250));
          await expect(fact(page, "Allocated")).toHaveText(sgd(8250));
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
          await (await saveButton(page, "Save as unallocated")).click();
          await expect(page.getByText(/^Payment saved:/)).toBeVisible({
            timeout: SAVE_TIMEOUT,
          });

          const receipt = copyOf("06", label);

          await openInbox(page);
          await uploadFiles(page, [receipt]);
          await expectStatus(page, receipt, "Needs your input");
          await openReview(page, receipt, "Review the paid receipt");

          const savePaid = await saveButton(page, "Save as paid");

          // czjw.72: a receipt paid in full asks no due date.
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

        // Steps 8 to 10 sign in as the recorded chat people: the tool list is part of the matched
        // request body, and the demo account's roles give it a longer list (phase-11.md, decisions).
        await test.step("8. ask Ask which customers have overdue invoices", async () => {
          await signInAs(
            page,
            onPhone(page)
              ? INVOICE_ASK_PEOPLE.phone
              : INVOICE_ASK_PEOPLE.desktop
          );

          // The shell posts on mount, so this response proves hydration before the question.
          const mounted = page.waitForResponse((response) =>
            response.url().endsWith("/api/session/activity")
          );

          await page.goto("/ask");
          await expect(
            page.getByRole("textbox", { name: "Message", exact: true })
          ).toBeVisible(FIRST_PAINT);
          await mounted;
          await askQuestion(page, OVERDUE_QUESTION);

          // The result first, with the total (R-44), from `overdue-invoices-*.json`.
          await expect(
            page.getByText(
              "Five overdue invoices from three customers have SGD 27,350.00 unpaid in all.",
              { exact: true }
            )
          ).toBeVisible(FIRST_PAINT);
          // The ended answer moves Ask to the chat's own page, and that route change closes a panel
          // opened before it.
          await expect(page).toHaveURL(/\/ask\/[0-9a-f-]{36}$/, FIRST_PAINT);

          // The records card opens its table in the artifact panel.
          await page
            .getByRole("button", {
              name: /^Overdue invoices and their sources/,
            })
            .click();

          const sources = page
            .getByRole("region", { name: "Artifact", exact: true })
            .getByRole("group", {
              name: "Overdue invoices and their sources",
              exact: true,
            })
            .getByRole("link");

          await expect(sources).toHaveText(
            [
              "INV-2026-08-04",
              "INV-2026-09-03",
              "INV-2026-09-04",
              "INV-2026-10-01",
              "INV-2026-10-03",
            ],
            FIRST_PAINT
          );

          // A source opens its record in the app.
          await page.waitForLoadState("networkidle");
          await sources.filter({ hasText: "INV-2026-09-04" }).click();
          await expect(
            page.getByRole("heading", { level: 1, name: "INV-2026-09-04" })
          ).toBeVisible(FIRST_PAINT);
        });

        await test.step("9. add an unallocated payments panel to a dashboard by chat", async () => {
          await resetChatDashboard();
          await signInAs(page, ANALYTICS_PEOPLE.chat);
          await page.goto(
            `/m/analytics/dashboards/${ANALYTICS_CHAT_DASHBOARD.id}`
          );
          await expect(
            page.getByText("No panels yet", { exact: true })
          ).toBeVisible(FIRST_PAINT);

          await sendToDashboardsAgent(page, ANALYTICS_CHAT_MESSAGE);

          // The panel reads the baseline ledger: step 7 removed the uploads, and the baseline
          // links every payment, so no payment is unallocated. The starter has no such panel.
          await expect(
            page
              .getByRole("figure", { name: "Unallocated payments" })
              .first()
              .getByText(sgd(0), { exact: true })
          ).toBeVisible(FIRST_PAINT);
        });

        await test.step("10. hand the five-slide deck over from Ask, present it and export it", async () => {
          await removeOwnDecks(SLIDES_PEOPLE.chat);
          // Ask beside the Slides list hands the deck over, and the Slides agent builds it (R-42b).
          await handOverWholeDeck(page);

          await activate(
            page,
            page.getByRole("button", { name: "Present", exact: true })
          );

          const next = page.getByRole("button", { name: "Next slide" });

          /* eslint-disable no-await-in-loop -- the deck moves one slide per press. */
          for (const number of [1, 2, 3, 4, 5]) {
            await expect(
              page.getByText(`${number} / 5`, { exact: true })
            ).toBeVisible(FIRST_PAINT);

            if (number < 5) await activate(page, next);
          }
          /* eslint-enable no-await-in-loop */

          await activate(page, page.getByRole("button", { name: "Exit" }));

          const downloading = page.waitForEvent("download", {
            timeout: FIRST_PAINT.timeout,
          });

          await activate(
            page,
            page.getByRole("button", { name: "Export to PowerPoint" })
          );

          const download = await downloading;

          expect(download.suggestedFilename()).toMatch(/\.pptx$/);

          const path = await download.path();

          if (path === null) throw new Error("The export has no file.");

          // The slides module's own reader opens the zip, so a broken or empty file fails here.
          const pptx = await readPptx(await readFile(path));

          expect(pptx.slideCount).toBe(5);
          // The lines of slides 1 and 2 and the bars of slide 3 are native charts.
          expect(pptx.chartParts).toHaveLength(3);
          expect(await pptx.xmlOf("ppt/slides/slide1.xml")).toContain(
            MONTHLY_DECK.slideTitles[0]
          );
        });
      } finally {
        await removeUploadRecords(tenantOf(), UPLOAD_PREFIX);
        await resetChatDashboard();
        await removeOwnDecks(SLIDES_PEOPLE.chat);
      }
    },
    LOCK_WAIT
  );
});
