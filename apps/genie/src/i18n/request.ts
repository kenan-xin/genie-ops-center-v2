import { getRequestConfig } from "next-intl/server";

/**
 * The request configuration next-intl reads, at the path its plugin resolves by
 * default (`src/i18n/request.ts`, confirmed against the next-intl App Router
 * documentation on 2026-09-21).
 *
 * Section 0 ships one locale. A second language becomes a translation task
 * rather than a refactor (DEC-13).
 */
export default getRequestConfig(async () => ({
  locale: "en",
  messages: (await import("../messages/en.json")).default,
}));
