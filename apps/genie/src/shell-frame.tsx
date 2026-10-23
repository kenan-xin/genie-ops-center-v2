import { AppShell, type ShellChrome } from "@genie/core/features/shell";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers.js";
import type { ReactNode } from "react";

import { documentSessionState } from "./document-session.ts";
import { PATHNAME_HEADER } from "./pathname-header.ts";
import { shellModel } from "./shell-model.ts";

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

  const t = await getTranslations("shell");
  const [model, requestHeaders] = await Promise.all([shellModel(), headers()]);

  const person = state.session.user;

  const switchTarget = !model.isAdministrator
    ? null
    : props.chrome === "admin"
      ? { label: t("backToWorkspace"), href: model.landing ?? "/" }
      : model.adminHome === undefined
        ? null
        : { label: t("administration"), href: model.adminHome };

  return (
    <AppShell
      chrome={props.chrome}
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
      menu={{
        accountHref: person.isBreakGlass ? "/admin/account" : "/account",
        changePasswordHref: model.changePasswordUrl,
        switchTarget,
        supportHref: model.support?.href ?? null,
        signOutAction: "/api/auth/sign-out",
      }}
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
