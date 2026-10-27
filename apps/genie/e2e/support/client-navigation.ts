import type { Page } from "@playwright/test";

/**
 * The client-side navigation a link click makes: Next's client router fetches the page's server
 * payload, and the root layout does not run again, so only the page's own checks answer. Resolves
 * once the browser sent that payload request. Phase 08 (NAV-1) replaces a call with a real link
 * click wherever a link to the page exists.
 */
export async function pushInApp(page: Page, path: string): Promise<void> {
  const pathname = new URL(path, page.url()).pathname;

  const payload = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === pathname &&
      request.headers()["rsc"] === "1"
  );

  await page.evaluate((href) => {
    // SAFETY: Next sets `window.next.router` to the app router instance in every build; the test
    // calls its `push` and nothing else, and fails loudly below if the router is not there.
    const { next } = window as {
      readonly next?: { readonly router?: { push(href: string): void } };
    };

    if (next?.router === undefined)
      throw new Error("Next's client router is not on window.next");

    next.router.push(href);
  }, path);

  await payload;
}
