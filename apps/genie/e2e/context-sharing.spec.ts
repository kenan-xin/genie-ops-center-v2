import {
  enableModules,
  markSetupDone,
  startDisposableDeployment,
} from "@genie/core/testing";
import { placeholderModule } from "@genie/module-placeholder";
import { insertPlaceholderRecord } from "@genie/module-placeholder/testing";
import { type Page, expect, test } from "@playwright/test";

import { imageHostPort } from "../testing/image-ports.ts";
import { startImage } from "../testing/image-process.ts";

const CONTEXT_HEADER = "x-genie-context-id";

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

  expect(response.status()).toBe(200);

  const trpc = response.headers()[CONTEXT_HEADER];

  expect(trpc, "the tRPC handler wrote no context header").toBeDefined();

  expect(new Set([home, viewer, trpc]).size).toBe(1);
});

test("two stacks of one image keep placeholder data isolated at phone and desktop viewports", async ({
  page,
  request,
}, testInfo) => {
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

    expect(firstResponse.status()).toBe(200);
    expect(secondResponse.status()).toBe(200);
    expect(await firstResponse.text()).toContain("first-stack-only");
    expect(await firstResponse.text()).not.toContain("second-stack-only");
    expect(await secondResponse.text()).toContain("second-stack-only");
    expect(await secondResponse.text()).not.toContain("first-stack-only");
  } finally {
    await Promise.all([
      firstImage?.stop(),
      secondImage?.stop(),
      first.stop(),
      second.stop(),
    ]);
  }
});
