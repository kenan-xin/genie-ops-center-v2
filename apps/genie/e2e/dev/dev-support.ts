import { mintDevSession } from "@genie/core/testing";
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
 * Opens the inbox and waits for the shell's mount ping. The activity client posts on mount, so
 * the page's effects have run: React's development double effect (mount, unmount, mount) is over.
 * A file chosen before that replay ends is lost, because its unmount calls Pacer's `stop()` after
 * `choose()` started the queue.
 */
export async function openInbox(page: Page): Promise<void> {
  const mounted = page.waitForResponse((response) =>
    response.url().endsWith("/api/session/activity")
  );

  await page.goto("/m/invoices/documents");
  await expect(
    page.getByRole("heading", { level: 1, name: "Documents" })
  ).toBeVisible(FIRST_PAINT);
  await mounted;
}

/** One fact of a record page, read through the term that labels it. */
export const fact = (page: Page, label: string) =>
  page.locator(
    `xpath=//dt[normalize-space(.)="${label}"]/following-sibling::dd[1]`
  );

/**
 * The links of one record, read from whichever layout the viewport draws. The card names the other
 * side: "Payments" on an invoice, "Invoices" on a payment.
 */
export function allocationsOn(page: Page, label: "Payments" | "Invoices") {
  return onPhone(page)
    ? page.getByRole("list", { name: label }).getByRole("listitem")
    : page
        .getByRole("table", { name: label })
        .locator("tbody")
        .getByRole("row");
}

export type Upload = {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
};

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
