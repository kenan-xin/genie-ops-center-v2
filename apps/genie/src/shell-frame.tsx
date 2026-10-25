import {
  AppShell,
  shellChrome,
  shellMenu,
  type ShellChrome,
} from "@genie/core/features/shell";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers.js";
import { redirect } from "next/navigation.js";
import type { ReactNode } from "react";

import { documentSessionState } from "./document-session.ts";
import { PATHNAME_HEADER } from "./pathname-header.ts";
import { shellModel } from "./shell-model.ts";

/**
 * The break-glass account lives only in the admin chrome (design `account-and-inbox`, U-3), so a
 * workspace page sends it to the admin home. It bypasses `can()`, so its admin tree is never empty;
 * its own account page is the fallback all the same.
 */
export async function keepBreakGlassInAdmin(): Promise<void> {
  const state = await documentSessionState();

  if (state.status === "authenticated" && state.session.user.isBreakGlass)
    redirect((await shellModel()).adminHome ?? "/admin/account");
}

/**
 * The signed-in frame every shell page wraps its output in (Spec 3 R-27). A request without an
 * authenticated session gets the page unchanged. The tree is already permitted, so this frame
 * makes no authorization decision of its own (R-30).
 */
export async function ShellFrame(props: {
  readonly chrome: ShellChrome;
  readonly title?: string;
  readonly children: ReactNode;
}): Promise<ReactNode> {
  const state = await documentSessionState();

  if (state.status !== "authenticated") return props.children;

  if (props.chrome === "workspace") await keepBreakGlassInAdmin();

  const t = await getTranslations("shell");
  const [model, requestHeaders] = await Promise.all([shellModel(), headers()]);

  const person = state.session.user;
  const chrome = shellChrome(props.chrome, model.isAdministrator);

  return (
    <AppShell
      chrome={chrome}
      {...(props.title === undefined ? {} : { title: props.title })}
      currentPath={requestHeaders.get(PATHNAME_HEADER) ?? "/"}
      navigation={model.navigation}
      identity={model.identity}
      user={{
        name: person.name.trim() || person.email,
        roleLabel: model.isAdministrator
          ? t("roleAdministrator")
          : t("roleMember"),
      }}
      menu={shellMenu({
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
      })}
      strings={{
        workspace: t("workspace"),
        adminPortal: t("adminPortal"),
        pinned: t("pinned"),
        categories: t("categories"),
        navigation: t("navigation"),
        openNavigation: t("openNavigation"),
        closeNavigation: t("closeNavigation"),
        offline: t("offline"),
        account: t("account"),
        changePassword: t("changePassword"),
        opensInNewTab: t("opensInNewTab"),
        helpAndSupport: t("helpAndSupport"),
        signOut: t("signOut"),
      }}
    >
      {props.children}
    </AppShell>
  );
}
