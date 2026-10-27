import { supportContact } from "@genie/core";
import { NoGrantsEmptyState, PageHeader } from "@genie/core/features/shell";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation.js";

import { SIGNED_OUT, SIGNED_OUT_PATH } from "../auth.ts";
import { requireContext } from "../context.ts";
import { requireSession } from "../document-session.ts";
import { keepBreakGlassInAdmin, ShellFrame } from "../shell-frame.tsx";
import { shellModel } from "../shell-model.ts";

export const dynamic = "force-dynamic";

/**
 * The home route (Spec 3 R-34). A signed-in person whose navigation tree resolves a landing route
 * goes there, so Back to workspace and a typed `/` land on the same page; without one, they go to
 * the first workspace entry of the tree. `requireSession()` sends an idle session to the expired
 * banner, a signed-out visitor to the sign-in page and a limited break-glass session to the door
 * (ARCH-1). A signed-in person with no workspace entry sees the shell around the no-grants empty state
 * (CR-PRIMITIVES-M1). The shell's sidebar is the navigation;
 * hiding an entry is not the enforcement, each route still refuses in its own `can()` check.
 *
 * AC-26, across real bundles. This page's own server bundle stamps the id it read onto the
 * document it renders. The proxy never writes this attribute, so a second context in this bundle
 * would render a different value here even while every proxy log line agreed with itself.
 *
 * Every user-facing string resolves through the catalogue, never a direct JSON
 * import, because R-43 requires the catalogue to be the one path for text.
 */
export default async function HomePage(props: {
  readonly searchParams: Promise<{ readonly state?: string }>;
}) {
  // The realm's end-session redirect returns to `PUBLIC_URL`, the one post-logout address it
  // registers, with the `state` sign-out sent; the signed-out sign-in page owns that state (R-17a).
  if ((await props.searchParams).state === SIGNED_OUT)
    redirect(SIGNED_OUT_PATH);

  await requireSession();

  // Before the landing redirect, so break-glass goes to the admin home in one hop (U-3).
  await keepBreakGlassInAdmin();

  const { landing, workspaceHome } = await shellModel();

  const home = landing ?? workspaceHome;

  if (home !== undefined) redirect(home);

  const tShell = await getTranslations("shell");
  const tNoGrants = await getTranslations("noGrants");
  const { contextId, tenant } = requireContext();

  const branding = await tenant.branding.get();
  const contact = supportContact(branding);

  return (
    <ShellFrame chrome="workspace">
      <main data-context-id={contextId}>
        <PageHeader title={tShell("workspace")} />
        <NoGrantsEmptyState
          title={tNoGrants("title")}
          description={tNoGrants("description")}
          {...(contact && {
            contact: {
              href: contact.href,
              label: tNoGrants("contact", {
                companyName: branding.companyName,
              }),
            },
          })}
        />
      </main>
    </ShellFrame>
  );
}
