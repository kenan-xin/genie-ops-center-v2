import {
  idleExpiry,
  isLimitedBreakGlass,
  readCookie,
  sessionCookieName,
} from "@genie/core";
import { brandingHead, BrandingHeadElements } from "@genie/core/features/shell";
import { Toaster } from "@genie/ui";
import defaultFontHref from "@genie/ui/fonts/plus-jakarta-sans-latin-wght-normal.woff2?url";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { headers } from "next/headers.js";
import { redirect } from "next/navigation.js";
import type { ReactNode } from "react";

import { readContext } from "../context.ts";
import { DevtoolsMount } from "../devtools/devtools-mount.tsx";
import { deploymentDiagnostics } from "../devtools/diagnostics.ts";
import { documentSessionState } from "../document-session.ts";
import { LimitedSessionMount } from "../limited-session-mount.tsx";
import { PATHNAME_HEADER } from "../pathname-header.ts";
import { QueryProvider } from "../providers.tsx";
import { SessionActivityMount } from "../session-activity-mount.tsx";
import { SETUP_REQUIRED_HEADER } from "../setup-required-header.ts";

import "../styles/globals.css";

/**
 * The routes a limited break-glass session may render. Every other route answers the
 * limited-session page (R-30, R-65): the door itself, where the first unmet step is shown.
 */
const LIMITED_SESSION_EXEMPT = ["/admin/login"];

function limitedSessionExempt(pathname: string): boolean {
  return LIMITED_SESSION_EXEMPT.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

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
  // enforced read (R-15a), so loading, restoring or navigating never writes last_active_at. The
  // one read also decides the limited-session page below, and the page rendering in parallel
  // shares it, so a document pays for one session read and makes one idle decision.
  const context = readContext();

  // R-12a, D3-5: a fresh deployment has no branding row and the reader throws on a missing row,
  // so the not-set-up page and a process without a context emit the packages/ui defaults.
  const head = brandingHead(
    setupRequired || context === undefined
      ? undefined
      : await context.tenant.branding.get()
  );

  const cookieName =
    context === undefined
      ? undefined
      : sessionCookieName(context.tenant.env.publicUrl);

  // Read with the same name rule as Better Auth's cookie parser, so `name =token` counts too.
  const carriesSessionCookie =
    cookieName !== undefined &&
    readCookie((await headers()).get("cookie") ?? "", cookieName) !== undefined;

  const requestHeaders = await headers();

  const session =
    context === undefined || !carriesSessionCookie
      ? undefined
      : await documentSessionState();

  if (session?.status === "idle-expired") redirect("/api/auth/session-expired");

  const activity =
    context === undefined || session?.status !== "authenticated"
      ? undefined
      : await (async () => {
          const settings = await context.tenant.settings.get();

          return {
            idleMinutes: settings.sessionIdleMinutes,
            initialIdleExpiresAt: idleExpiry({
              lastActivityAt:
                session.session.session.lastActiveAt ??
                session.session.session.createdAt,
              idleMinutes: settings.sessionIdleMinutes,
            }).toISOString(),
          };
        })();

  // R-30, R-65: a limited break-glass session renders the limited-session page on every route
  // except the door itself, whatever the route asked for. The activity client stays mounted, so
  // the session can still expire normally.
  const limited =
    context === undefined ||
    session?.status !== "authenticated" ||
    !isLimitedBreakGlass(session.session.user) ||
    limitedSessionExempt(requestHeaders.get(PATHNAME_HEADER) ?? "")
      ? undefined
      : await (async () => {
          const limitedBranding = await context.tenant.branding.get();

          return {
            productName: limitedBranding.productName,
            passwordChanged: !session.session.user.mustChangePassword,
            authenticatorEnrolled: session.session.user.twoFactorEnabled,
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
          <QueryProvider>
            {activity === undefined ? null : (
              <SessionActivityMount {...activity} />
            )}
            {limited === undefined ? (
              children
            ) : (
              <LimitedSessionMount {...limited} />
            )}
          </QueryProvider>
        </NextIntlClientProvider>
        <Toaster />
        {diagnostics === undefined ? null : (
          <DevtoolsMount {...deploymentDiagnostics(diagnostics)} />
        )}
      </body>
    </html>
  );
}
