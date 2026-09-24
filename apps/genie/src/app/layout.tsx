import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { headers } from "next/headers.js";
import type { ReactNode } from "react";

import { readContext } from "../context.ts";
import { DevtoolsMount } from "../devtools/devtools-mount.tsx";
import { deploymentDiagnostics } from "../devtools/diagnostics.ts";
import { QueryProvider } from "../providers.tsx";
import { SETUP_REQUIRED_HEADER } from "../setup-required-header.ts";

import "../styles/globals.css";

/**
 * The title comes from the catalogue rather than from a literal here, so the
 * application's own strings have one home (DEC-13).
 */
export async function generateMetadata() {
  const t = await getTranslations("app");

  return { title: t("title") };
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
  const context =
    process.env.NODE_ENV === "development" ? readContext() : undefined;

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <QueryProvider>{children}</QueryProvider>
        </NextIntlClientProvider>
        {context === undefined ? null : (
          <DevtoolsMount {...deploymentDiagnostics(context)} />
        )}
      </body>
    </html>
  );
}
