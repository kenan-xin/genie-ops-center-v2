import { readDemoCsv } from "@genie/module-invoices/testing";
import { expect, test, type Page } from "@playwright/test";

import { expectNoAxeViolations } from "../support/axe.ts";
import { withDeploymentLock } from "../support/lock.ts";
import {
  allocationsOn,
  FIRST_PAINT,
  fact,
  LEDGER_LOCK,
  LOCK_WAIT,
  onPhone,
  openDetails,
  expectPageDrawn,
  expectPinsOnMarks,
  sgd,
  signIn,
} from "./dev-support.ts";
import { DEV_MODULES } from "./global-setup.ts";

test.skip(
  !DEV_MODULES.has("invoices"),
  "This run does not compile the invoices module."
);

declare global {
  interface Window {
    /** Written before a row link is clicked and read after it, so a document reload cannot pass. */
    __genieMarker?: number;
  }
}

/**
 * The seeded demo pages, on the development run's own disposable database (Task 9, P17). The
 * global setup seeds the demo pack and the demo account's roles with `seed-demo.ts`; these cases
 * read what the assembled pages show at the phone and the desktop viewport (R-59, R-60, DEC-25).
 */

type ShownRow = {
  /** The identity cell: the invoice number or the payment label. */
  readonly label: string;
  /** The badge's text, which is the status on both layouts. */
  readonly status: string;
  readonly text: string;
};

/** Every shown row of a list, read from whichever layout the viewport draws. */
function shownRows(page: Page, label: string): Promise<readonly ShownRow[]> {
  return onPhone(page)
    ? page
        .getByRole("list", { name: label })
        .getByRole("listitem")
        .evaluateAll((items) =>
          items.map((item) => ({
            label: item.querySelector("a")?.textContent?.trim() ?? "",
            status:
              item.querySelector('[data-slot="badge"]')?.textContent?.trim() ??
              "",
            text: item.textContent ?? "",
          }))
        )
    : page
        .getByRole("table", { name: label })
        .locator("tbody tr")
        .evaluateAll((rows) =>
          rows.map((row) => ({
            label: row.querySelector("td")?.textContent?.trim() ?? "",
            status:
              row.querySelector('[data-slot="badge"]')?.textContent?.trim() ??
              "",
            text: row.textContent ?? "",
          }))
        );
}

/**
 * Navigates and waits for the shell's mount ping, so hydration and any dev-server reload are over
 * before a test reads the page (a cold compile can reload a page while axe runs).
 */
async function openList(
  page: Page,
  path: string,
  heading: string
): Promise<void> {
  const mounted = page.waitForResponse((response) =>
    response.url().endsWith("/api/session/activity")
  );

  await page.goto(path);
  await expect(
    page.getByRole("heading", { level: 1, name: heading })
  ).toBeVisible(FIRST_PAINT);
  await mounted;
}

/** The pack's status word in the page's word (P9). */
function statusText(invoice: Readonly<Record<string, string>>): string {
  switch (invoice.status) {
    case "overdue":
      return `Overdue · ${invoice.days_overdue} days`;
    case "paid":
      return "Paid";
    case "open":
      return "Open";
    case "due_date_unspecified":
      return "No due date";
    default:
      throw new Error(
        `The demo pack names an unknown status ${invoice.status}.`
      );
  }
}

test("the Invoices list shows every seeded invoice with its outstanding amount and status", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + FIRST_PAINT.timeout + 60_000);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await signIn(page);
      await openList(page, "/m/invoices/invoices", "Invoices");
      await expect(
        page.getByText("Balances as of 27 Oct 2026, the reporting date.")
      ).toBeVisible();

      const expected = readDemoCsv("04_Demo_Guide/expected_invoice_status.csv");

      expect(expected).toHaveLength(36);

      const shown = await shownRows(page, "Invoices");

      expect(shown).toHaveLength(expected.length);
      // A whole list offers no next page (czjw.28).
      await expect(page.getByRole("button", { name: "Show more" })).toHaveCount(
        0
      );

      const problems = expected.flatMap((invoice) => {
        const row = shown.find((entry) => entry.label === invoice.invoice_id);

        if (row === undefined) return [`${invoice.invoice_id}: not shown`];

        const found: string[] = [];
        const status = statusText(invoice);

        if (row.status !== status) {
          found.push(
            `${invoice.invoice_id}: status ${JSON.stringify(row.status)}, expected ${JSON.stringify(status)}`
          );
        }

        // A phone card names a paid invoice by its total, "SGD 5,000.00 paid" (task 7, the card).
        const outstanding = Number(invoice.outstanding_amount);

        const amount =
          onPhone(page) && outstanding === 0
            ? `${sgd(Number(invoice.total_amount))} paid`
            : sgd(outstanding);

        if (!row.text.includes(amount)) {
          found.push(
            `${invoice.invoice_id}: no ${amount} in ${JSON.stringify(row.text)}`
          );
        }

        return found;
      });

      expect(problems).toEqual([]);

      await expectNoAxeViolations(page, "invoices list");
    },
    LOCK_WAIT
  );
});

test("the Overdue tab keeps only the overdue invoices, in the address and in the figure strip", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + FIRST_PAINT.timeout + 60_000);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await signIn(page);
      await openList(page, "/m/invoices/invoices", "Invoices");

      const overdue = readDemoCsv(
        "04_Demo_Guide/expected_invoice_status.csv"
      ).filter((invoice) => invoice.status === "overdue");

      const overdueAmount = overdue.reduce(
        (sum, invoice) => sum + Number(invoice.outstanding_amount),
        0
      );

      expect(overdue.length).toBeGreaterThan(1);

      const tab = `Overdue ${overdue.length}`;

      // On a phone the status is a radio in the Filters sheet; the tabs show from 768 px.
      if (onPhone(page)) {
        await page.getByRole("button", { name: /^Filters/ }).click();
        await page.getByRole("radio", { name: tab }).click();
        await expect(page).toHaveURL(/[?&]status=overdue(&|$)/);
        await page
          .getByRole("button", { name: `Show ${overdue.length} invoices` })
          .click();
      } else {
        await page.getByRole("tab", { name: tab }).click();
        await expect(page).toHaveURL(/[?&]status=overdue(&|$)/);
      }

      // The server answers the filter, and the figure strip counts every overdue invoice.
      await expect(fact(page, "Overdue")).toHaveText(sgd(overdueAmount));
      await expect(fact(page, "Invoices")).toHaveText(String(overdue.length));
      await expect
        .poll(async () =>
          (await shownRows(page, "Invoices")).map((row) => row.label).toSorted()
        )
        .toEqual(overdue.map((invoice) => invoice.invoice_id).toSorted());

      await expectNoAxeViolations(page, "invoices list filtered");
    },
    LOCK_WAIT
  );
});

/** The demo pack's total of each shown invoice, in the shown order. */
async function shownTotals(page: Page): Promise<readonly number[]> {
  const totals = new Map(
    readDemoCsv("04_Demo_Guide/expected_invoice_status.csv").map((invoice) => [
      invoice.invoice_id,
      Number(invoice.total_amount),
    ])
  );

  return (await shownRows(page, "Invoices")).map(
    (row) => totals.get(row.label) ?? Number.NaN
  );
}

/** Waits until all 36 invoices show in the order of their totals. */
async function expectTotalOrder(
  page: Page,
  direction: "asc" | "desc"
): Promise<void> {
  await expect
    .poll(async () => {
      const totals = await shownTotals(page);

      return totals.length === 36 &&
        totals.every((total, at) =>
          at === 0
            ? !Number.isNaN(total)
            : direction === "asc"
              ? (totals[at - 1] ?? 0) <= total
              : (totals[at - 1] ?? 0) >= total
        )
        ? "in order"
        : totals.join(", ");
    })
    .toBe("in order");
}

test("a sort by Total runs on the server in both directions and survives a reload", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + FIRST_PAINT.timeout * 2 + 60_000);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await signIn(page);

      if (onPhone(page)) {
        // A phone has no column headers: the address picks the column and the sort line reverses it.
        await openList(
          page,
          "/m/invoices/invoices?sort=total.desc",
          "Invoices"
        );
        await expectTotalOrder(page, "desc");
        await page
          .getByRole("button", { name: "Sort: Total, highest first" })
          .click();
      } else {
        await openList(page, "/m/invoices/invoices", "Invoices");

        const total = page.getByRole("columnheader", { name: "Total" });

        // The first click sorts descending, the second ascending (LH5).
        await total.getByRole("button").click();
        await expect(page).toHaveURL(/[?&]sort=total\.desc(&|$)/);
        await expect(total).toHaveAttribute("aria-sort", "descending");
        await expectTotalOrder(page, "desc");
        await total.getByRole("button").click();
        await expect(total).toHaveAttribute("aria-sort", "ascending");
      }

      await expect(page).toHaveURL(/[?&]sort=total\.asc(&|$)/);
      await expectTotalOrder(page, "asc");

      // The reload reads the sort from the address, so the server page comes back in the same order.
      await page.reload();
      await expect(
        page.getByRole("heading", { level: 1, name: "Invoices" })
      ).toBeVisible(FIRST_PAINT);
      await expectTotalOrder(page, "asc");
    },
    LOCK_WAIT
  );
});

test("INV-2026-09-03 opens from its row without a document load and shows its balance, its link, its history and its PDF", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + FIRST_PAINT.timeout + 60_000);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await signIn(page);
      await openList(page, "/m/invoices/invoices", "Invoices");

      // A click before hydration would make a full document load even through `PageLink`, so the
      // marker is written only after the client has settled.
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => {
        // oxlint-disable-next-line no-underscore-dangle -- the task brief names this marker.
        window.__genieMarker = 1;
      });

      await page
        .getByRole("link", { name: "INV-2026-09-03", exact: true })
        .click();

      await expect(
        page.getByRole("heading", { level: 1, name: "INV-2026-09-03" })
      ).toBeVisible(FIRST_PAINT);

      // `PageLink` routes in the client, so the document, and the marker on it, survive.
      // oxlint-disable-next-line no-underscore-dangle -- the task brief names this marker.
      expect(await page.evaluate(() => window.__genieMarker)).toBe(1);

      // E1 (czjw.84): the PDF draws in the page, with no click.
      await expectPageDrawn(page);

      if (onPhone(page)) {
        // The closed sheet shows the status and the outstanding amount.
        const sheet = page.getByRole("region", {
          name: "Details of INV-2026-09-03",
        });

        await expect(sheet).toContainText("Overdue · 40 days");
        await expect(sheet).toContainText(sgd(5200));
        await openDetails(page);
      } else {
        await expectPinsOnMarks(page, [
          "customer",
          "number",
          "date",
          "dueDate",
          "description",
          "amount",
          "paymentTerms",
        ]);

        const drawer = page.getByRole("complementary", {
          name: "Payments and history",
        });

        await expect(drawer).toContainText("TXN-PAY-2026-026");
        await expect(
          drawer.getByRole("list", { name: "History" }).getByRole("listitem")
        ).toHaveCount(1);
      }

      await expect(fact(page, "Total")).toHaveText(sgd(7200));
      await expect(fact(page, "Paid")).toHaveText(sgd(2000));
      await expect(fact(page, "Outstanding")).toHaveText(sgd(5200));
      // The status pill sits beside Outstanding in the header strip (2.3).
      await expect(page.getByRole("region", { name: "Figures" })).toContainText(
        "Overdue · 40 days"
      );

      const allocations = allocationsOn(page, "Payments");

      await expect(allocations).toHaveCount(1);
      await expect(allocations).toContainText("TXN-PAY-2026-026");
      await expect(allocations).toContainText(sgd(2000));

      // History reads as sentences with the stored link amount (2.5).
      const history = page
        .getByRole("list", { name: "History" })
        .getByRole("listitem");

      await expect(history).toHaveCount(1);
      await expect(history).toContainText("Payment TXN-PAY-2026-026 linked");
      await expect(history).toContainText(`for ${sgd(2000)}.`);

      await expectNoAxeViolations(page, "invoice record page");

      // Review Focus 5: the desk picks its layout by width, so a hard load must not mismatch.
      const hydration: string[] = [];

      page.on("console", (message) => {
        if (/hydrat/i.test(message.text())) hydration.push(message.text());
      });
      await page.reload();
      await expectPageDrawn(page);
      expect(hydration).toEqual([]);
    },
    LOCK_WAIT
  );
});

test("the Payments list shows every seeded payment and the payment linked to INV-2026-09-03 names it", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + FIRST_PAINT.timeout + 60_000);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await signIn(page);
      await openList(page, "/m/invoices/payments", "Payments");
      await expect(
        page.getByText("Amounts as of 27 Oct 2026, the reporting date.")
      ).toBeVisible();

      const payments = readDemoCsv("01_History_Datasets/payments.csv");

      expect(payments).toHaveLength(30);
      // The figure strip counts every payment, not only a loaded page.
      await expect(fact(page, "Payments")).toHaveText(String(payments.length));

      const shown = await shownRows(page, "Payments");

      expect(shown).toHaveLength(payments.length);
      // A whole list offers no next page (czjw.28).
      await expect(page.getByRole("button", { name: "Show more" })).toHaveCount(
        0
      );

      const problems = payments.flatMap((payment) => {
        const row = shown.find(
          (entry) => entry.label === payment.payment_reference
        );

        if (row === undefined) return [`${payment.payment_id}: not shown`];

        const amount = sgd(Number(payment.amount));

        return row.text.includes(amount)
          ? []
          : [
              `${payment.payment_id}: no ${amount} in ${JSON.stringify(row.text)}`,
            ];
      });

      expect(problems).toEqual([]);

      await expectNoAxeViolations(page, "payments list");

      const allocation = readDemoCsv(
        "01_History_Datasets/payment_allocations.csv"
      ).find((row) => row.invoice_id === "INV-2026-09-03");

      const payment = payments.find(
        (row) => row.payment_id === allocation?.payment_id
      );

      const reference = payment?.payment_reference;

      expect(reference).toBeTruthy();

      await page
        .getByRole("link", { name: reference ?? "", exact: true })
        .click();

      await expect(
        page.getByRole("heading", { level: 1, name: reference ?? "" })
      ).toBeVisible(FIRST_PAINT);

      await openDetails(page);

      const allocations = allocationsOn(page, "Invoices");

      await expect(allocations).toHaveCount(1);
      await expect(allocations).toContainText("INV-2026-09-03");

      await expectNoAxeViolations(page, "payment record page");
    },
    LOCK_WAIT
  );
});

test("a reference search keeps only the matching payments, in the address and on the server", async ({
  page,
}) => {
  test.setTimeout(LOCK_WAIT + FIRST_PAINT.timeout + 60_000);

  await withDeploymentLock(
    LEDGER_LOCK,
    async () => {
      await signIn(page);
      await openList(page, "/m/invoices/payments", "Payments");

      const term = "txn-pay-2026-02";

      const matching = readDemoCsv("01_History_Datasets/payments.csv")
        .map((payment) => payment.payment_reference ?? "")
        .filter((reference) => reference.toLowerCase().includes(term));

      expect(matching.length).toBeGreaterThan(1);

      // The search stays above the cards on a phone, so both viewports type in the same box.
      await page.getByRole("searchbox", { name: "Search" }).fill(term);
      await expect(page).toHaveURL(new RegExp(`[?&]q=${term}(&|$)`));

      await expect
        .poll(async () =>
          (await shownRows(page, "Payments")).map((row) => row.label).toSorted()
        )
        .toEqual(matching.toSorted());

      await expectNoAxeViolations(page, "payments list searched");
    },
    LOCK_WAIT
  );
});
