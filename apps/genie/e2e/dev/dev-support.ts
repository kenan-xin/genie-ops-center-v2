import { randomUUID } from "node:crypto";

import { mintDevSession } from "@genie/core/testing";
import {
  LIVE_UPLOADS,
  readDemoFile,
  withNewId,
} from "@genie/module-invoices/testing";
import {
  expect,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";

import { TEST_AUTH_ENV } from "../../testing/auth-env.ts";
import { DEMO_ACCOUNT_EMAIL, DEV_DB_PORT, DEV_PORT } from "./global-setup.ts";

/** What the invoices browser specs share: the run's addresses, session, inbox and page reads. */

export const PUBLIC_URL = `http://127.0.0.1:${DEV_PORT}`;

export const DATABASE_URL = `postgres://genie:genie@127.0.0.1:${DEV_DB_PORT}/genie`;

/** A development server compiles a route when it is first asked for (see `devtools.spec.ts`). */
export const FIRST_PAINT = { timeout: 120_000 };

/**
 * The lock the invoices specs take. One review flow measured 28.5 s at the desktop viewport and
 * 28 s at the phone (its 54.0 s test was 26 s of lock wait plus the flow). The four specs hold the
 * lock one test at a time, and a `--repeat-each=3` run of 54 tests measured about five minutes end
 * to end, so a waiter's turn can be that late.
 */
export const LEDGER_LOCK = "invoices-ledger";

export const LOCK_WAIT = 600_000;

export const MONEY = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "SGD",
});

/** The guide's money word, as `invoices.spec.ts` writes it. */
export const sgd = (dollars: number) => MONEY.format(dollars);

/** Below Tailwind's `md`, `DataTable` draws its card list instead of the table. */
export const onPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 768;

/** The demonstration account's session, minted directly (no realm in this run). */
export async function signIn(page: Page): Promise<void> {
  const { name, value, url, httpOnly, sameSite, expires } =
    await mintDevSession({
      databaseUrl: DATABASE_URL,
      publicUrl: PUBLIC_URL,
      secret: TEST_AUTH_ENV.BETTER_AUTH_SECRET,
      subject: { email: DEMO_ACCOUNT_EMAIL },
    });

  // Playwright refuses a cookie that carries both `url` and `path`; the `url` names the path.
  await page
    .context()
    .addCookies([{ name, value, url, httpOnly, sameSite, expires }]);
}

/**
 * Opens the inbox under one tab, All by default so a row shows under any status, and waits for the
 * shell's mount ping. The activity client posts on mount, so
 * the page's effects have run: React's development double effect (mount, unmount, mount) is over.
 * A file chosen before that replay ends is lost, because its unmount calls Pacer's `stop()` after
 * `choose()` started the queue.
 */
export async function openInbox(page: Page, status = "all"): Promise<void> {
  const mounted = page.waitForResponse((response) =>
    response.url().endsWith("/api/session/activity")
  );

  await page.goto(`/m/invoices/documents?status=${status}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Documents" })
  ).toBeVisible(FIRST_PAINT);
  await mounted;
}

/**
 * One fact of a record page, read through the term that labels it. Visible only: a hard load can
 * leave React's late streamed segment as a hidden `div#S:0` copy of the page in the body.
 */
export const fact = (page: Page, label: string) =>
  page
    .locator(
      `xpath=//dt[normalize-space(.)="${label}"]/following-sibling::dd[1]`
    )
    .filter({ visible: true });

/**
 * The links of one record page. The desk draws them as a list in its drawer from 1280 px, and in
 * its sheet below that (open the sheet first with `openDetails`). The list names the other side:
 * "Payments" on an invoice, "Invoices" on a payment. Only the shown list counts as a role.
 */
export function allocationsOn(page: Page, label: "Payments" | "Invoices") {
  return page.getByRole("list", { name: label }).getByRole("listitem");
}

/** Below 1280 px a record page shows its figures, links and history only in the opened sheet. */
export async function openDetails(page: Page): Promise<void> {
  if ((page.viewportSize()?.width ?? 0) >= 1280) return;

  // The toggle reads "Hide details" once the sheet is open.
  const details = page.getByRole("button", {
    name: /^(Details|Hide details)$/,
  });

  // A press before hydration is lost, so it repeats until the sheet answers.
  await expect(async () => {
    if ((await details.getAttribute("aria-expanded")) !== "true") {
      await details.click();
    }

    await expect(details).toHaveAttribute("aria-expanded", "true", {
      timeout: 2_000,
    });
  }).toPass(FIRST_PAINT);
}

/** The record's PDF draws in the page (czjw.84); react-pdf sets the canvas width once it drew. */
export async function expectPageDrawn(page: Page): Promise<void> {
  await expect(
    page.locator('[data-document-viewer] canvas[style*="width"]').first()
  ).toBeVisible({ timeout: VIEWER_TIMEOUT });
}

/**
 * The desk of payment OR-AUG-SEP-BUNDLE, saved from upload 03 (E2): the page drawn, then its two
 * invoices and its history in the drawer with each read field pinned (desktop), or in the sheet.
 */
export async function expectBundleDesk(page: Page): Promise<void> {
  await expectPageDrawn(page);

  if (onPhone(page)) {
    await expect(
      page.getByRole("region", { name: "Details of OR-AUG-SEP-BUNDLE" })
    ).toContainText(sgd(8250));
    await openDetails(page);
  } else {
    await expectPinsOnMarks(page);
    await expect(
      page.getByRole("complementary", { name: "Invoices and history" })
    ).toBeVisible();
  }

  const links = allocationsOn(page, "Invoices");

  await expect(links).toHaveCount(2);
  await expect(links.filter({ hasText: "INV-2026-08-04" })).toContainText(
    sgd(4050)
  );
  await expect(links.filter({ hasText: "INV-2026-09-04" })).toContainText(
    sgd(4200)
  );
  await expect(
    page.getByRole("list", { name: "History" }).getByRole("listitem")
  ).not.toHaveCount(0);
}

/**
 * Each pin's dot sits on the line of its quote (czjw.84): the dot's middle is within 2 px of the
 * middle of its field's marks. Desktop only: below 1280 px the desk draws no pins. With no `keys`,
 * every drawn dot is checked, and at least one must be drawn.
 */
export async function expectPinsOnMarks(
  page: Page,
  keys?: readonly string[]
): Promise<void> {
  const dots = page.locator("[data-pin-dot]");

  await expect(dots.first()).toBeAttached({ timeout: VIEWER_TIMEOUT });

  const wanted =
    keys ??
    (await dots.evaluateAll((all) =>
      all.map((dot) => dot.getAttribute("data-pin-dot") ?? "")
    ));

  expect(wanted.length).toBeGreaterThan(0);

  await expect
    .poll(async () => {
      // In the page: `toJSON` turns each DOMRect into a plain object that crosses back.
      const boxes = await page.evaluate(
        (fieldKeys) =>
          fieldKeys.map((key) => ({
            key,
            dot: [...document.querySelectorAll(`[data-pin-dot="${key}"]`)].map(
              (element): Box => element.getBoundingClientRect().toJSON()
            ),
            marks: [
              ...document.querySelectorAll(`mark[data-highlight="${key}"]`),
            ].map((element): Box => element.getBoundingClientRect().toJSON()),
          })),
        wanted
      );

      return boxes
        .filter(
          ({ dot, marks }) => !(Math.abs(middleOf(dot) - middleOf(marks)) <= 2)
        )
        .map(({ key }) => key);
    })
    .toEqual([]);
}

type Box = { readonly top: number; readonly bottom: number };

/** The middle of the boxes' joined height, or NaN when there is none. */
function middleOf(boxes: readonly Box[]): number {
  if (boxes.length === 0) return Number.NaN;

  return (
    (Math.min(...boxes.map((box) => box.top)) +
      Math.max(...boxes.map((box) => box.bottom))) /
    2
  );
}

export type Upload = {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
};

/** The pdf.js worker and its text layer compile once per `next dev` (B9.4). */
export const VIEWER_TIMEOUT = 30_000;

/** A cold route's reading, from the file selection to the settled row. Measured 4.0 s warm. */
export const READING_TIMEOUT = 30_000;

/** The demo pack's live upload, found by its number in `LIVE_UPLOADS`. */
export function liveUpload(number: string): string {
  const name = LIVE_UPLOADS.find((file) => file.startsWith(`${number}_`));

  if (name === undefined) {
    throw new Error(`The demo pack has no live upload ${number}.`);
  }

  return name;
}

/**
 * One copy of a live upload, named `<label>-<uuid>-<file>`: `withNewId` rewrites the trailer
 * `/ID`, so the copy has its own SHA-256 and the text layer the recordings answer for (decision 14).
 */
export function copyOf(number: string, label: string): Upload {
  const file = liveUpload(number);

  return {
    name: `${label}-${randomUUID()}-${file}`,
    mimeType: "application/pdf",
    buffer: withNewId(readDemoFile(`03_Live_Upload_Documents/${file}`)),
  };
}

/** One inbox row of the open tab, read from whichever layout the viewport draws. */
export function rowOf(page: Page, label: string) {
  const main = page.getByRole("main");

  return onPhone(page)
    ? main.getByRole("list").getByRole("listitem").filter({ hasText: label })
    : main.getByRole("table").locator("tbody tr").filter({ hasText: label });
}

/** Waits until the row of `file` shows its status (R-37). */
export async function expectStatus(
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
export async function openReview(
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

/** The inbox posts one file to this route, then the reading worker picks it up. */
const UPLOAD_ROUTE = "/api/rpc/invoices/uploadDocument";

/**
 * A first upload after a source change measured over 120 s of compile and hydration on this
 * machine, so the upload gets two first-paint budgets.
 */
export const UPLOAD_TIMEOUT = FIRST_PAINT.timeout * 2;

/**
 * Hands the files to the `<input type="file">` behind "Choose PDF files".
 *
 * A choice made before the Documents chunk hydrates is lost with no upload and no refusal, so the
 * choice repeats. It repeats only while no upload request has gone out: a second choice after a
 * request would store the same file again and add a Duplicate row. Every file's response is then
 * checked outside the retry, so a refusal or a missing answer fails instead of sending again.
 */
export async function uploadFiles(
  page: Page,
  files: readonly Upload[]
): Promise<void> {
  const responses: Response[] = [];

  const onResponse = (response: Response) => {
    if (
      response.request().method() === "POST" &&
      response.url().endsWith(UPLOAD_ROUTE)
    ) {
      responses.push(response);
    }
  };

  page.on("response", onResponse);

  try {
    let sent = false;

    const onRequest = (request: Request) => {
      if (request.method() === "POST" && request.url().endsWith(UPLOAD_ROUTE)) {
        sent = true;
      }
    };

    page.on("request", onRequest);

    try {
      await expect(async () => {
        if (sent) return;

        const input = page.locator('input[type="file"]');

        // Clearing first makes the same files fire a change after a lost choice; without it the
        // input still holds them and a second choice dispatches nothing.
        await input.setInputFiles([]);
        await input.setInputFiles(files.map((file) => ({ ...file })));
        // A short poll, so a lost choice repeats inside the outer window instead of spending it.
        await expect.poll(() => sent, { timeout: 5_000 }).toBe(true);
      }).toPass({ timeout: UPLOAD_TIMEOUT });
    } finally {
      page.off("request", onRequest);
    }

    // A request went out: never send again. Wait for every file's answer, then inspect them.
    await expect
      .poll(() => responses.length, { timeout: UPLOAD_TIMEOUT })
      .toBe(files.length);

    const refused = responses.find((response) => !response.ok());

    if (refused !== undefined) {
      throw new Error(
        `The upload was refused (${refused.status()} ${refused.statusText()}).`
      );
    }
  } finally {
    page.off("response", onResponse);
  }
}
