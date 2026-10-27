import { DEFAULT_FAVICON_URL, faviconHref } from "@genie/core";
import { brandingHead, BrandingHeadElements } from "@genie/core/features/shell";
import { Toaster } from "@genie/ui";
import defaultFontHref from "@genie/ui/fonts/plus-jakarta-sans-latin-wght-normal.woff2?url";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { headers } from "next/headers.js";
import type { ReactNode } from "react";

import { readContext } from "../context.ts";
import { DevtoolsMount } from "../devtools/devtools-mount.tsx";
import { deploymentDiagnostics } from "../devtools/diagnostics.ts";
import { documentSessionState } from "../document-session.ts";
import { NextRouteFocus } from "../next-app-shell.tsx";
import { QueryProvider } from "../providers.tsx";
import { principalForSession } from "../request-principal.ts";
import { SETUP_REQUIRED_HEADER } from "../setup-required-header.ts";

import "../styles/globals.css";

/**
 * The title comes from the catalogue rather than from a literal here, so the
 * application's own strings have one home (DEC-13). The tab icon is the published
 * favicon, else the Ops Center default (DR-03); the not-set-up page has no branding
 * row, so it takes the default.
 */
export async function generateMetadata() {
  const t = await getTranslations("app");
  const context = readContext();
  const setupRequired = (await headers()).get(SETUP_REQUIRED_HEADER) === "1";

  // A principal without a redirect: this layout also renders `/sign-in` and the door, where
  // `requireSession()` would redirect to the page itself.
  const state =
    setupRequired || context === undefined
      ? undefined
      : await documentSessionState();

  const icon =
    context === undefined || state === undefined
      ? DEFAULT_FAVICON_URL
      : await faviconHref(
          context.tenant.fileStorage,
          principalForSession(
            context.tenant,
            state.status === "authenticated" ? state.session : null
          )
        );

  return { title: t("title"), icons: { icon } };
}

/**
 * The locale comes from the request configuration rather than from a route
 * segment, so a second language changes `src/i18n/request.ts` and nothing here
 * (DEC-13). The provider is what makes the same catalogue readable from a
 * client component.
 */
export default async function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  const locale = await getLocale();

  // The proxy rewrites every document to the not-set-up route while the deployment is not set up
  // (D-2), and marks the rewritten request. On that page the catalogue is withheld: passing it
  // would serialize every namespace into the flight payload, including the shell and viewer
  // strings R-16 says the standalone page must not carry.
  const setupRequired = (await headers()).get(SETUP_REQUIRED_HEADER) === "1";
  const messages = setupRequired ? {} : await getMessages();

  // No auth check here: a layout does not render again on a client-side navigation, so each page
  // checks the session itself through `requireSession()` (ARCH-1).
  const context = readContext();

  // R-12a, D3-5: a fresh deployment has no branding row and the reader throws on a missing row,
  // so the not-set-up page and a process without a context emit the packages/ui defaults.
  const head = brandingHead(
    setupRequired || context === undefined
      ? undefined
      : await context.tenant.branding.get()
  );

  // Read, not required. A page that renders before the bootstrap published has
  // nothing true to report, and this layout is not the place to decide that a
  // request cannot be served.
  //
  // The development check is here, on the server, and not only inside the
  // client component. A guard inside the client component suppresses the
  // rendering but not the props: they would cross the boundary first and be
  // serialized into the flight payload of every page, so a production visitor
  // could read the database name, the module ids and the permission keys out of
  // the HTML. Deciding here means the element is never created in production and
  // nothing is sent.
  const diagnostics =
    process.env.NODE_ENV === "development" ? context : undefined;

  return (
    // The theme script sets data-theme before hydration, so <html> carries suppressHydrationWarning.
    <html lang={locale} data-theme={head.theme} suppressHydrationWarning>
      <head>
        <BrandingHeadElements head={head} />
        {/* Fonts are fetched in CORS mode, so a preload without crossOrigin is fetched twice. */}
        <link
          rel="preload"
          href={defaultFontHref}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <QueryProvider>{children}</QueryProvider>
        </NextIntlClientProvider>
        <NextRouteFocus />
        <Toaster />
        {diagnostics === undefined ? null : (
          <DevtoolsMount {...deploymentDiagnostics(diagnostics)} />
        )}
      </body>
    </html>
  );
}
