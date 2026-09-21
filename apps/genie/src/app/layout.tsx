import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import type { ReactNode } from "react";

import "../styles/globals.css";

export const metadata = { title: "Genie Ops Center" };

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
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
