import { isLimitedBreakGlass } from "@genie/core";
import {
  PageSkeleton,
  shellChrome,
  shellMenu,
  type AppShellProps,
  type ShellChrome,
} from "@genie/core/features/shell";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation.js";
import type { ReactNode } from "react";

import { AgentBubble } from "./agent-bubble.tsx";
import { requireContext } from "./context.ts";
import { documentSessionState, requireSession } from "./document-session.ts";
import { NextAppShell } from "./next-app-shell.tsx";
import { SessionActivityMount } from "./session-activity-mount.tsx";
import { shellModel } from "./shell-model.ts";

/**
 * The break-glass account lives only in the admin chrome (design `account-and-inbox`, U-3), so a
 * workspace page sends it to the admin home. It bypasses `can()`, so its admin tree is never empty;
 * its own account page is the fallback all the same. Each workspace page calls it, never the
 * workspace layout, which does not redirect.
 */
export async function keepBreakGlassInAdmin(): Promise<void> {
  if ((await requireSession()).user.isBreakGlass)
    redirect((await shellModel()).adminHome ?? "/admin/account");
}

/**
 * The signed-in frame (Spec 3 R-27) of the two shell layouts and of the pages outside them. It
 * checks the session first through `requireSession()` (ARCH-1). The tree is already permitted, so
 * this frame makes no authorization decision of its own (R-30). The activity client lives here, so
 * it exists only on signed-in shell pages and ends on any navigation away from them (R-15a).
 * Internal shell links navigate with `next/link` (NAV-1).
 */
export async function ShellFrame(props: {
  readonly chrome: ShellChrome;
  readonly children: ReactNode;
}): Promise<ReactNode> {
  const shell = await shellProps(props.chrome);
  const settings = await requireContext().tenant.settings.get();

  return (
    <>
      <SessionActivityMount idleMinutes={settings.sessionIdleMinutes} />
      <AgentBubble />
      <NextAppShell {...shell}>{props.children}</NextAppShell>
    </>
  );
}

/**
 * A layout's shell: the frame for a live session, else the bare page. It never redirects. A layout
 * renders beside its pages and keeps its answer across client navigations, so the 404 and the
 * sign-in redirect belong to each page's own check, which runs before any loading fallback
 * (`6wz1.76`, `6wz1.77`).
 */
export async function ShellLayout(props: {
  readonly chrome: ShellChrome;
  readonly children: ReactNode;
}): Promise<ReactNode> {
  const state = await documentSessionState();

  if (
    state.status !== "authenticated" ||
    isLimitedBreakGlass(state.session.user)
  )
    return props.children;

  return <ShellFrame chrome={props.chrome}>{props.children}</ShellFrame>;
}

/**
 * The fallback of every loading.tsx: the session check, then the skeleton. The check runs before
 * the fallback streams, so a signed-out request still answers with its redirect (`6wz1.76`).
 */
export async function PageLoading(): Promise<ReactNode> {
  await requireSession();

  const shellText = await getTranslations("shell");

  return <PageSkeleton label={shellText("loading")} />;
}

/** The shell's props for a signed-in request, after the session check (ARCH-1). */
async function shellProps(
  requested: ShellChrome
): Promise<
  Omit<AppShellProps, "linkComponent" | "children" | "title" | "currentPath">
> {
  const session = await requireSession();

  const t = await getTranslations("shell");

  const model = await shellModel();

  const person = session.user;
  const chrome = shellChrome(requested, model.isAdministrator);

  return {
    chrome,
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
