import { type Page, expect, test } from "@playwright/test";

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
