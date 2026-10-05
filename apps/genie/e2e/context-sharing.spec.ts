import {
  enableModules,
  insertCredentialPerson,
  insertSession,
  markSetupDone,
  signedSessionCookie,
  startDisposableDeployment,
} from "@genie/core/testing";
import { placeholderModule } from "@genie/module-placeholder";
import { insertPlaceholderRecord } from "@genie/module-placeholder/testing";
import { type Page, expect, test } from "@playwright/test";

import { TEST_AUTH_ENV } from "../testing/auth-env.ts";
import { imageHostPort } from "../testing/image-ports.ts";
import { startImage } from "../testing/image-process.ts";

const CONTEXT_HEADER = "x-genie-context-id";

/** The password of each stack's reader, created per stack because each database is separate. */
const READER_PASSWORD = "two-stack-reader-password-14";

/**
 * A real session for one stack's reader. R-62 refuses a credential session for anyone but the
 * break-glass account, so the row is written into that stack's own database and its cookie signed
 * the way Better Auth does. The public origin is HTTPS, so the cookie is the `__Host-` name (R-4a).
 */
async function sessionFor(
  context: Parameters<typeof insertSession>[0],
  userId: string
): Promise<string> {
  const token = await insertSession(context, { userId });

  return signedSessionCookie({
    token,
    secret: TEST_AUTH_ENV.BETTER_AUTH_SECRET,
    name: "__Host-genie-session",
  });
}

/**
 * The context id a page's own server bundle rendered into the document. The
 * proxy never writes this attribute, so the value comes from the page bundle.
 */
async function documentContextId(page: Page, path: string): Promise<string> {
  await page.goto(path);

  const value = await page
    .locator("[data-context-id]")
    .first()
    .getAttribute("data-context-id");

  expect(value, `no context id rendered by ${path}`).not.toBeNull();

  return value ?? "";
}

// AC-26 across real bundles, observed from the browser. The proxy is a single
// bundle, so its one log line cannot show that the page, tRPC and viewer bundles
// share a context. Each of these observations is produced by the bundle that
// served the request: two documents by their page bundles, one header by the
// tRPC route handler. A second context anywhere would split the set.
test("one process context serves the page, tRPC and viewer bundles", async ({
  page,
  request,
  baseURL,
}) => {
  const home = await documentContextId(page, "/");
  const viewer = await documentContextId(page, "/viewer/placeholder");

  const response = await request.get(
    `${baseURL}/api/trpc/placeholder.read?input=${encodeURIComponent("{}")}`
  );

  // The anonymous request holds no session, so the envelope answers `unauthenticated` at 401
  // (Spec 2 R-14); the refusal is still written by the tRPC route handler bundle.
  expect(response.status()).toBe(401);

  const trpc = response.headers()[CONTEXT_HEADER];

  expect(trpc, "the tRPC handler wrote no context header").toBeDefined();

  expect(new Set([home, viewer, trpc]).size).toBe(1);
});

test("two stacks of one image keep placeholder data isolated at phone and desktop viewports", async ({
  page,
  request,
}, testInfo) => {
  // Two disposable databases and two app images start inside this test. Beside the full suite's
  // stacks that took past Playwright's 30 second default (S2-16 gate run, 2026-10-06), so the
  // bound covers the container starts, not the assertions.
  test.setTimeout(180_000);

  const first = await startDisposableDeployment([placeholderModule]);
  const second = await startDisposableDeployment([placeholderModule]);
  // The phone and desktop runs can share a moment, so each worker gets its own
  // pair. The worker index stays small, which keeps the ports below the
  // ephemeral range that imageHostPort refuses; the process id did not.
  const firstPort = imageHostPort(3500 + testInfo.workerIndex * 2);
  const secondPort = imageHostPort(3501 + testInfo.workerIndex * 2);
  let firstImage: Awaited<ReturnType<typeof startImage>> | undefined;
  let secondImage: Awaited<ReturnType<typeof startImage>> | undefined;

  try {
    await Promise.all([
      markSetupDone(first.context),
      markSetupDone(second.context),
      enableModules(first.context, ["placeholder"]),
      enableModules(second.context, ["placeholder"]),
    ]);

    await Promise.all([
      insertPlaceholderRecord(first.context, { label: "first-stack-only" }),
      insertPlaceholderRecord(second.context, { label: "second-stack-only" }),
    ]);

    // One reader per stack, holding `placeholder:read` through a real role assignment in that
    // stack's own database, so each read below is authorized by the real evaluator. Their session
    // is written directly (R-62 leaves the credential path to the break-glass account): the
    // session row and the evaluator are real, only the sign-in transport is stood up.
    const [firstReader, secondReader] = await Promise.all([
      insertCredentialPerson(first.context, {
        email: "first-reader@example.com",
        password: READER_PASSWORD,
        isBreakGlass: false,
        permissions: ["placeholder:read"],
      }),
      insertCredentialPerson(second.context, {
        email: "second-reader@example.com",
        password: READER_PASSWORD,
        isBreakGlass: false,
        permissions: ["placeholder:read"],
      }),
    ]);

    firstImage = await startImage(
      {
        DATABASE_URL: first.context.env.databaseUrl,
        PUBLIC_URL: "https://example.invalid",
      },
      firstPort
    );
    secondImage = await startImage(
      {
        DATABASE_URL: second.context.env.databaseUrl,
        PUBLIC_URL: "https://example.invalid",
      },
      secondPort
    );

    const firstUrl = `http://127.0.0.1:${firstPort}`;
    const secondUrl = `http://127.0.0.1:${secondPort}`;

    const health = async (url: string) =>
      request.get(`${url}/api/health`).then(
        async (response) => response.text(),
        () => ""
      );

    await expect.poll(() => health(firstUrl)).toBe("ok");
    await expect.poll(() => health(secondUrl)).toBe("ok");

    await page.goto(firstUrl);

    const firstResponse = await request.get(
      `${firstUrl}/api/trpc/placeholder.read?input=${encodeURIComponent("{}")}`
    );

    await page.goto(secondUrl);

    const secondResponse = await request.get(
      `${secondUrl}/api/trpc/placeholder.read?input=${encodeURIComponent("{}")}`
    );

    // An anonymous request is refused by each stack's own handler as unauthenticated at 401, and
    // no row reaches the browser from either database. The signed-in read with a real grant in
    // each database follows.
    expect(firstResponse.status()).toBe(401);
    expect(secondResponse.status()).toBe(401);
    expect(firstResponse.headers()[CONTEXT_HEADER]).not.toBe(
      secondResponse.headers()[CONTEXT_HEADER]
    );

    for (const body of [
      await firstResponse.text(),
      await secondResponse.text(),
    ]) {
      expect(body).not.toContain("first-stack-only");
      expect(body).not.toContain("second-stack-only");
    }

    // S2-04: with a signed-in reader holding a real grant in each database, each read returns the
    // row of its own stack and never the other's. The anonymous refusals above stay as controls.
    const firstCookie = await sessionFor(first.context, firstReader);

    const secondCookie = await sessionFor(second.context, secondReader);

    const firstSigned = await request.get(
      `${firstUrl}/api/trpc/placeholder.read?input=${encodeURIComponent("{}")}`,
      { headers: { cookie: firstCookie } }
    );

    const secondSigned = await request.get(
      `${secondUrl}/api/trpc/placeholder.read?input=${encodeURIComponent("{}")}`,
      { headers: { cookie: secondCookie } }
    );

    expect(firstSigned.status()).toBe(200);
    expect(secondSigned.status()).toBe(200);

    const firstBody = await firstSigned.text();
    const secondBody = await secondSigned.text();

    expect(firstBody).toContain("first-stack-only");
    expect(firstBody).not.toContain("second-stack-only");
    expect(secondBody).toContain("second-stack-only");
    expect(secondBody).not.toContain("first-stack-only");
  } finally {
    await Promise.all([
      firstImage?.stop(),
      secondImage?.stop(),
      first.stop(),
      second.stop(),
    ]);
  }
});
