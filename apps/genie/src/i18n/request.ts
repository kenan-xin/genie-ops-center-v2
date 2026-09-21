import { type RequestConfig, getRequestConfig } from "next-intl/server";

/**
 * The locale and the catalogue this deployment serves.
 *
 * Exported so a test can assert the configuration serves the catalogue file
 * rather than a copy of it, and can drive the provider with the same messages
 * the request does. The dynamic import is required: this package's `module` is
 * `nodenext`, which demands an import attribute on a static JSON import.
 */
export async function servedConfig(): Promise<RequestConfig> {
  return {
    locale: "en",
    messages: (await import("../messages/en.json")).default,
  };
}

/**
 * The request configuration next-intl reads, at the path its plugin resolves by
 * default (`src/i18n/request.ts`, confirmed against the next-intl App Router
 * documentation on 2026-09-21).
 *
 * Section 0 ships one locale. A second language becomes a translation task
 * rather than a refactor (DEC-13).
 */
export default getRequestConfig(servedConfig);
