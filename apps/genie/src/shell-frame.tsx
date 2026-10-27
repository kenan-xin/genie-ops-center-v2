import {
  PageSkeleton,
  shellChrome,
  shellMenu,
  type AppShellProps,
  type ShellChrome,
} from "@genie/core/features/shell";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers.js";
import { redirect } from "next/navigation.js";
import type { ReactNode } from "react";

import { requireContext } from "./context.ts";
import { requireSession } from "./document-session.ts";
import { NextAppShell } from "./next-app-shell.tsx";
import { PATHNAME_HEADER } from "./pathname-header.ts";
import { SessionActivityMount } from "./session-activity-mount.tsx";
import { shellModel } from "./shell-model.ts";

/**
 * The break-glass account lives only in the admin chrome (design `account-and-inbox`, U-3), so a
 * workspace page sends it to the admin home. It bypasses `can()`, so its admin tree is never empty;
 * its own account page is the fallback all the same.
 */
export async function keepBreakGlassInAdmin(): Promise<void> {
  if ((await requireSession()).user.isBreakGlass)
    redirect((await shellModel()).adminHome ?? "/admin/account");
}

/**
 * The signed-in frame every shell page wraps its output in (Spec 3 R-27). It checks the session
 * first through `requireSession()` (ARCH-1). The tree is already permitted, so this frame makes no
 * authorization decision of its own (R-30). The activity client lives here, so it exists only on
 * signed-in shell pages and ends on any navigation away from them (R-15a). Internal shell links
 * navigate with `next/link` (NAV-1).
 */
export async function ShellFrame(props: {
  readonly chrome: ShellChrome;
  readonly title?: string;
  readonly children: ReactNode;
}): Promise<ReactNode> {
  const shell = await shellProps(props.chrome);
  const settings = await requireContext().tenant.settings.get();

  return (
    <>
      <SessionActivityMount idleMinutes={settings.sessionIdleMinutes} />
      <NextAppShell
        {...shell}
        {...(props.title === undefined ? {} : { title: props.title })}
      >
        {props.children}
      </NextAppShell>
    </>
  );
}

/**
 * The frame of a core admin page's `loading.tsx` (NAV-1 decision 4). It mounts no activity client,
 * because the page's own frame mounts one when it replaces this, so one page never mounts two (the
 * ARCH-1 follow-on).
 */
export async function ShellLoading(props: {
  readonly chrome: ShellChrome;
}): Promise<ReactNode> {
  const shell = await shellProps(props.chrome);
  const shellText = await getTranslations("shell");

  return (
    <NextAppShell {...shell}>
      <PageSkeleton label={shellText("loading")} />
    </NextAppShell>
  );
}

/** The shell's props for a signed-in request, after the session check (ARCH-1). */
async function shellProps(
  requested: ShellChrome
): Promise<Omit<AppShellProps, "linkComponent" | "children" | "title">> {
  const session = await requireSession();

  if (requested === "workspace") await keepBreakGlassInAdmin();

  const t = await getTranslations("shell");

  const [model, requestHeaders] = await Promise.all([shellModel(), headers()]);

  const person = session.user;
  const chrome = shellChrome(requested, model.isAdministrator);

  return {
    chrome,
    currentPath: requestHeaders.get(PATHNAME_HEADER) ?? "/",
    navigation: model.navigation,
    identity: model.identity,
    user: {
      name: person.name.trim() || person.email,
      roleLabel: model.isAdministrator
        ? t("roleAdministrator")
        : t("roleMember"),
    },
    menu: shellMenu({
      chrome,
      isAdministrator: model.isAdministrator,
      isBreakGlass: person.isBreakGlass,
      landing: model.landing,
      adminHome: model.adminHome,
      changePasswordHref: model.changePasswordUrl,
      supportHref: model.support?.href ?? null,
      labels: {
        backToWorkspace: t("backToWorkspace"),
        administration: t("administration"),
      },
    }),
    strings: {
      workspace: t("workspace"),
      adminPortal: t("adminPortal"),
      pinned: t("pinned"),
      categories: t("categories"),
      navigation: t("navigation"),
      openNavigation: t("openNavigation"),
      closeNavigation: t("closeNavigation"),
      offline: t("offline"),
      pageContent: t("pageContent"),
      account: t("account"),
      changePassword: t("changePassword"),
      opensInNewTab: t("opensInNewTab"),
      helpAndSupport: t("helpAndSupport"),
      signOut: t("signOut"),
    },
  };
}
