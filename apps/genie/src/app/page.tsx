import { supportContact } from "@genie/core";
import { NoGrantsEmptyState, PageHeader } from "@genie/core/features/shell";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation.js";

import { SIGNED_OUT, SIGNED_OUT_PATH } from "../auth.ts";
import { requireContext } from "../context.ts";
import { documentSessionState } from "../document-session.ts";
import { ShellFrame } from "../shell-frame.tsx";
import { shellModel } from "../shell-model.ts";

export const dynamic = "force-dynamic";

/**
 * The home route (Spec 3 R-34). A signed-in person whose navigation tree resolves a landing route
 * goes there, so Back to workspace and a typed `/` land on the same page. Everyone else sees the
 * shell (when signed in) around the no-grants empty state. The shell's sidebar is the navigation;
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

  const signedIn = (await documentSessionState()).status === "authenticated";

  if (signedIn) {
    const { landing } = await shellModel();

    if (landing !== undefined) redirect(landing);
  }

  const tApp = await getTranslations("app");
  const tShell = await getTranslations("shell");
  const tNoGrants = await getTranslations("noGrants");
  const { contextId, tenant } = requireContext();

  const branding = await tenant.branding.get();
  const contact = supportContact(branding);

  return (
    <ShellFrame chrome="workspace">
      <main data-context-id={contextId}>
        {/* An anonymous home keeps the product heading (setup gate AC-2); the shell names it Workspace. */}
        <PageHeader title={signedIn ? tShell("workspace") : tApp("title")} />
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
