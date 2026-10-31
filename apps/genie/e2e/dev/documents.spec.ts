import { randomUUID } from "node:crypto";

import {
  LIVE_UPLOADS,
  readDemoFile,
  withNewId,
} from "@genie/module-invoices/testing";
import { expect, test, type Page } from "@playwright/test";

import { expectNoAxeViolations } from "../support/axe.ts";
import { withDeploymentLock } from "../support/lock.ts";
import {
  LEDGER_LOCK,
  LOCK_WAIT,
  MONEY,
  onPhone,
  openInbox,
  signIn,
  type Upload,
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

/** A cold route's reading, from the file selection to the settled row. Measured 4.0 s warm. */
const READING_TIMEOUT = 30_000;

/**
 * The lock's queue, one upload's two UPLOAD_TIMEOUTs (request, then response) and the body.
 */
const TEST_TIMEOUT = LOCK_WAIT + UPLOAD_TIMEOUT * 2 + 60_000;

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

/** Every shown row of the inbox, read from whichever layout the viewport draws. */
function shownRows(page: Page): Promise<readonly ShownRow[]> {
  return onPhone(page)
    ? page
        .getByRole("list", { name: "Documents" })
        .getByRole("listitem")
        .evaluateAll(readRow)
    : page
        .getByRole("table", { name: "Documents" })
        .locator("tbody tr")
        .evaluateAll(readRow);
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

/** The demo pack's live upload, found by its number in `LIVE_UPLOADS`. */
function liveUpload(number: string): string {
  const name = LIVE_UPLOADS.find((file) => file.startsWith(`${number}_`));

  if (name === undefined) {
    throw new Error(`The demo pack has no live upload ${number}.`);
  }

  return name;
}

/**
 * One project's own copy of a live upload: `withNewId` rewrites the trailer `/ID`, so the copy has
 * its own SHA-256 and the text layer the recordings answer for (decision 14).
 */
function copyOf(number: string, project: string): Upload {
  const file = liveUpload(number);

  return {
    name: `${project}-${randomUUID()}-${file}`,
    mimeType: "application/pdf",
    buffer: withNewId(readDemoFile(`03_Live_Upload_Documents/${file}`)),
  };
}

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
