import { readDemoJson } from "@genie/module-invoices/testing";
import { expect, test, type Page } from "@playwright/test";

import { expectNoAxeViolations } from "../support/axe.ts";
import { withDeploymentLock } from "../support/lock.ts";
import {
  copyOf,
  FIRST_PAINT,
  LEDGER_LOCK,
  LOCK_WAIT,
  MONEY,
  onPhone,
  openInbox,
  READING_TIMEOUT,
  signIn,
  UPLOAD_TIMEOUT,
  uploadFiles,
} from "./dev-support.ts";
import { DEV_MODULES } from "./global-setup.ts";

test.skip(
  !DEV_MODULES.has("invoices"),
  "This run does not compile the invoices module."
);

/**
 * The Documents inbox on the development run's disposable database, with the reading worker that
 * `global-setup.ts` starts and the six hand-written readings `model-replay.ts` replays (Spec 7
 * AC-7 to the inbox, R-23 to R-27, R-37, DEC-25). Each project uploads copies whose trailer `/ID`
 * is rewritten, so every copy has its own hash. It never uploads `02`: its automatic link changes
 * the figures `invoices.spec.ts` asserts in the same run (decision 14).
 */

/**
 * The lock's queue, one upload's two UPLOAD_TIMEOUTs (request, then response) and the body.
 */
const TEST_TIMEOUT = LOCK_WAIT + UPLOAD_TIMEOUT * 2 + 60_000;

// SAFETY: the demo pack's history file is read verbatim; only the two list lengths are used.
const HISTORY = readDemoJson("01_History_Datasets/history_seed.json") as {
  readonly invoices: readonly unknown[];
  readonly payments: readonly unknown[];
};

/** Every seeded history document has its record, so it stays Done whatever the run uploads. */
const HISTORY_DOCUMENTS = HISTORY.invoices.length + HISTORY.payments.length;

type ShownRow = {
  /** The badge's text, which is the status on both layouts. */
  readonly status: string;
  readonly text: string;
};

/** The status badge and the whole text of one row, whichever layout drew it. */
function readRow(items: readonly Element[]): ShownRow[] {
  return items.map((item) => ({
    status:
      item.querySelector('[data-slot="badge"]')?.textContent?.trim() ?? "",
    text: item.textContent ?? "",
  }));
}

/**
 * Every shown row of the inbox's open tab, read from whichever layout the viewport draws. The other layout is `display: none`, so its rows are skipped.
 */
function shownRows(page: Page): Promise<readonly ShownRow[]> {
  const main = page.getByRole("main");

  return onPhone(page)
    ? main.getByRole("list").getByRole("listitem").evaluateAll(readRow)
    : main.getByRole("table").locator("tbody tr").evaluateAll(readRow);
}

type ExpectedRow = {
  /** The uploaded copy's file name, which is the row's label. */
  readonly label: string;
  readonly status: string;
  /** Parts of "What we found" that the row must show. */
  readonly text: readonly string[];
};

/**
 * Waits until every expected row shows with its status and its found text. A row is the one row
 * with that status whose text holds the label, so the Duplicate row can share its label with the
 * row it copies.
 */
async function expectInboxRows(
  page: Page,
  expected: readonly ExpectedRow[],
  timeout: number
): Promise<void> {
  await expect(async () => {
    const shown = await shownRows(page);

    const problems = expected.flatMap((row) => {
      const match = shown.find(
        (candidate) =>
          candidate.status === row.status && candidate.text.includes(row.label)
      );

      if (match === undefined) {
        const statuses = shown.map((candidate) => candidate.status).join(", ");

        return [
          `${row.label}: no row with status ${JSON.stringify(row.status)}; shown: ${statuses}`,
        ];
      }

      return row.text
        .filter((text) => !match.text.includes(text))
        .map(
          (text) =>
            `${row.label}: no ${JSON.stringify(text)} in ${JSON.stringify(match.text)}`
        );
    });

    expect(problems).toEqual([]);
  }).toPass({ timeout });
}

/** React's words for a server and client render that differ (czjw.83). */
const HYDRATION_MESSAGE = /hydrat|did not match|server rendered HTML/i;

test("the inbox and a review page load with no hydration warning", async ({
  page,
}) => {
  test.setTimeout(FIRST_PAINT.timeout * 3 + 60_000);

  const messages: string[] = [];

  page.on("console", (message) => messages.push(message.text()));
  page.on("pageerror", (error) => messages.push(error.message));

  // Each page gets its own document load, because a client navigation hydrates nothing.
  const load = async (path: string) => {
    const mounted = page.waitForResponse((response) =>
      response.url().endsWith("/api/session/activity")
    );

    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible(
      FIRST_PAINT
    );
    await mounted;
  };

  await signIn(page);
  // The resting tab, then All, which holds a row on a fresh database too.
  await load("/m/invoices/documents");
  await load("/m/invoices/documents?status=all");

  const review = await page
    .getByRole("main")
    .locator('a[href^="/m/invoices/documents/"]')
    .first()
    .getAttribute("href");

  expect(review).toBeTruthy();
  await load(review ?? "");

  expect(messages.filter((text) => HYDRATION_MESSAGE.test(text))).toEqual([]);
});

test("Done reads its first page, and a scroll to the end reads the rest", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + FIRST_PAINT.timeout + 60_000);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await signIn(page);
      // The mount ping means no dev-server reload can replace the list during the scroll.
      await openInbox(page, "done");

      // The seeded history documents are Done, so Done holds more than one page of 50 (LH6).
      // A phone shows the count above the cards and in the footer; the hidden layout is skipped.
      const first = page
        .getByText(/^Showing 50 of \d+ documents$/)
        .filter({ visible: true })
        .first();

      await expect(first).toBeVisible(FIRST_PAINT);

      const total = Number(
        /of (\d+)/.exec((await first.textContent()) ?? "")?.[1]
      );

      // At least the history, not exactly: uploads the run kept as Done add to it (czjw.86).
      expect(total).toBeGreaterThanOrEqual(HISTORY_DOCUMENTS);

      // No click on Show more: reaching the end of the list reads the next page (czjw.70).
      await page
        .getByRole("button", { name: "Show more" })
        .scrollIntoViewIfNeeded();

      await expect(
        page
          .getByText(`${total} documents`, { exact: true })
          .filter({ visible: true })
          .first()
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Show more" })).toHaveCount(
        0
      );
      await expect.poll(async () => (await shownRows(page)).length).toBe(total);
    },
    LOCK_WAIT
  );
});

/** On a phone the filters but the search sit in the Filters sheet; on a desktop in the bar. */
async function withFilters(
  page: Page,
  pick: () => Promise<void>
): Promise<void> {
  if (onPhone(page)) {
    await page.getByRole("button", { name: /^Filters/ }).click();
    await pick();
    await page.getByRole("button", { name: /^Show / }).click();

    return;
  }

  // A narrow bar keeps the controls that do not fit in More filters (LH27).
  const more = page.getByRole("button", { name: "More filters" });

  if (await more.isVisible()) await more.click();

  await pick();
}

test("the inbox search, type and upload date narrow the rows on the server", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + FIRST_PAINT.timeout + 60_000);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await signIn(page);
      await openInbox(page);

      const shownTexts = async () =>
        (await shownRows(page)).map((row) => row.text);

      // The search matches the file name or the invoice number.
      const term = "INV-2026-09-03";
      const search = page.getByRole("searchbox", { name: "Search" });

      await search.fill(term);
      await expect(page).toHaveURL(new RegExp(`[?&]q=${term}(&|$)`));
      await expect
        .poll(async () => {
          const texts = await shownTexts();

          return texts.length > 0 && texts.every((text) => text.includes(term));
        })
        .toBe(true);

      await search.fill("");
      await expect(page).not.toHaveURL(/[?&]q=/);

      // The type keeps only the payment documents.
      await withFilters(page, async () => {
        // The bar stays in the page on a phone, hidden, so only the shown trigger counts.
        await page
          .getByLabel("Document type: All types")
          .filter({ visible: true })
          .click();
        await page.getByRole("option", { name: "Payment evidence" }).click();
      });
      await expect(page).toHaveURL(/[?&]type=payment(&|$)/);
      await expect
        .poll(async () => {
          const texts = await shownTexts();

          return (
            texts.length > 0 &&
            texts.every((text) => text.includes("Payment evidence"))
          );
        })
        .toBe(true);

      // Every document was uploaded today, so last month holds none and this month holds them.
      const range = async (preset: string) =>
        withFilters(page, async () => {
          await page
            .getByLabel(/^Upload date: /)
            .filter({ visible: true })
            .click();
          await page.getByRole("button", { name: preset, exact: true }).click();
          await page.getByRole("button", { name: "Done", exact: true }).click();
        });

      await range("Last month");
      await expect(page).toHaveURL(/[?&]uploaded=/);
      await expect(
        page.getByText("No document matches these filters.")
      ).toBeVisible();

      await range("This month");
      await expect
        .poll(async () => (await shownTexts()).length)
        .toBeGreaterThan(0);
    },
    LOCK_WAIT
  );
});

test("uploads live documents and shows their statuses", async ({
  page,
}, testInfo) => {
  test.setTimeout(TEST_TIMEOUT);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      const project = testInfo.project.name;
      const invoice = copyOf("01", project);
      const split = copyOf("03", project);
      const unmatched = copyOf("05", project);
      const purchaseOrder = copyOf("07", project);

      await signIn(page);
      await openInbox(page);

      await uploadFiles(page, [invoice, split, unmatched, purchaseOrder]);

      // B9.1: the multipart upload, the worker pickup and the list refresh all work in the real app.
      await expectInboxRows(
        page,
        [
          {
            label: invoice.name,
            status: "Needs your input",
            text: [`ABC Trading · ${MONEY.format(5000)}`],
          },
          {
            label: split.name,
            status: "Confirm the split",
            text: ["→ 2 invoices"],
          },
          {
            label: unmatched.name,
            status: "No matching invoice",
            text: ["Meridian Labs"],
          },
          {
            label: purchaseOrder.name,
            status: "Kept as a reference",
            text: ["No figure changes"],
          },
        ],
        READING_TIMEOUT
      );

      // B9.1: the same bytes again create nothing and add one Duplicate row for this visit (R-23).
      await uploadFiles(page, [purchaseOrder]);

      await expectInboxRows(
        page,
        [
          {
            label: purchaseOrder.name,
            status: "Duplicate (nothing added)",
            text: [`Same file as ${purchaseOrder.name}`],
          },
        ],
        READING_TIMEOUT
      );
    },
    LOCK_WAIT
  );
});

test("has no accessibility violations with rows", async ({
  page,
}, testInfo) => {
  test.setTimeout(TEST_TIMEOUT);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      const invoice = copyOf("01", testInfo.project.name);

      await signIn(page);
      await openInbox(page);

      await uploadFiles(page, [invoice]);
      await expectInboxRows(
        page,
        [
          {
            label: invoice.name,
            status: "Needs your input",
            text: [`ABC Trading · ${MONEY.format(5000)}`],
          },
        ],
        READING_TIMEOUT
      );

      // B9.2: the inbox with rows has no accessibility defect at this viewport (DEC-21, DEC-25).
      await expectNoAxeViolations(page, "Documents inbox");
    },
    LOCK_WAIT
  );
});
