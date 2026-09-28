import { idleExpiry, sessionCookieName } from "@genie/core";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { headers } from "next/headers.js";
import type { ReactNode } from "react";

import { requireAuth } from "../auth.ts";
import { readContext } from "../context.ts";
import { DevtoolsMount } from "../devtools/devtools-mount.tsx";
import { deploymentDiagnostics } from "../devtools/diagnostics.ts";
import { QueryProvider } from "../providers.tsx";
import { SessionActivityMount } from "../session-activity-mount.tsx";
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

  // The activity client mounts for a live browser session. Its first expiry is supplied by this
  // enforced read (R-15a), so loading, restoring or navigating never writes last_active_at.
  const context = readContext();

  const cookieName =
    context === undefined
      ? undefined
      : sessionCookieName(context.tenant.env.publicUrl);

  const carriesSessionCookie =
    cookieName !== undefined &&
    ((await headers()).get("cookie") ?? "").includes(`${cookieName}=`);

  const activity =
    context === undefined || !carriesSessionCookie
      ? undefined
      : await (async () => {
          const [settings, current] = await Promise.all([
            context.tenant.settings.get(),
            requireAuth(context.tenant).getSession({
              headers: await headers(),
            }),
          ]);

          if (current === null) return undefined;

          return {
            idleMinutes: settings.sessionIdleMinutes,
            initialIdleExpiresAt: idleExpiry({
              lastActivityAt:
                current.session.lastActiveAt ?? current.session.createdAt,
              idleMinutes: settings.sessionIdleMinutes,
            }).toISOString(),
          };
        })();

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
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <QueryProvider>
            {activity === undefined ? null : (
              <SessionActivityMount {...activity} />
            )}
            {children}
          </QueryProvider>
        </NextIntlClientProvider>
        {diagnostics === undefined ? null : (
          <DevtoolsMount {...deploymentDiagnostics(diagnostics)} />
        )}
      </body>
    </html>
  );
}
