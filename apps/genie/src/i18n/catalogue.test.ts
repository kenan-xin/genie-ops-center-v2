import { NextIntlClientProvider, useTranslations } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { servedConfig } from "./request.ts";

// A dynamic import for the same reason `request.ts` uses one: this package's
// `module` is `nodenext`, which demands an import attribute on a static import.
const en = (await import("../messages/en.json")).default;

/**
 * The catalogue is the only place the application's own strings live. These two
 * tests are what makes that true rather than aspirational: the first fails if
 * `request.ts` is gone, or serves a catalogue other than this one, and the
 * second fails if those messages cannot reach a component through the provider
 * the layout mounts.
 *
 * They do not render the layout itself. It is an async server component that
 * awaits `getLocale()` and `getMessages()`, both of which read the request
 * scope, so it cannot be rendered outside a Next request — and
 * `anti-slop/no-module-mocking` bans `vi.mock`, which is the usual way around
 * that. The rendered page is proved by the end-to-end test in Task 9.
 *
 * `createElement` rather than JSX because the app's `tsconfig.json` carries
 * Next's `"jsx": "preserve"`, which Vite 8 hands to Oxc and Oxc rejects, so a
 * `.tsx` file under `src/` fails to parse before it runs.
 */
function Probe() {
  const t = useTranslations("app");

  return createElement("span", null, t("title"));
}

describe("the English catalogue", () => {
  it("is what the request configuration serves", async () => {
    const config = await servedConfig();

    expect(config.locale).toBe("en");
    expect(config.messages).toEqual(en);
  });

  it("reaches a component through the provider", () => {
    // `children` goes inside the props object rather than after it: with
    // `createElement` the variadic form does not satisfy a component whose
    // props type requires `children`, which is how the JSX transform hides it.
    const html = renderToStaticMarkup(
      createElement(NextIntlClientProvider, {
        locale: "en",
        messages: en,
        children: createElement(Probe),
      })
    );

    expect(html).toContain(en.app.title);
  });
});
