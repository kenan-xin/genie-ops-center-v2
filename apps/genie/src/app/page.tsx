import { navigationTree, supportContact } from "@genie/core";
import { NoGrantsEmptyState } from "@genie/core/features/shell";
import { focusRing, NavigationList } from "@genie/ui";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation.js";

import { SIGNED_OUT, SIGNED_OUT_PATH } from "../auth.ts";
import { requireContext } from "../context.ts";
import { documentPrincipal } from "../document-session.ts";
import { modules } from "../registry.ts";

export const dynamic = "force-dynamic";

/**
 * The ordinary document, built from the Spec 3 navigation tree: the workspace entries, one list per
 * category, one Administration link, and the no-grants empty state when nothing lands (R-30, R-34).
 * The tree hides every module whose entitlement is off (R-8) and every entry whose permission the
 * person does not hold. Hiding is not the enforcement: each route still refuses in its own `can()`
 * check (R-35).
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

  const t = await getTranslations("app");
  const { contextId, tenant } = requireContext();

  const tree = await navigationTree({
    tenant,
    modules,
    caller: await documentPrincipal(),
  });

  const tNoGrants = await getTranslations("noGrants");
  const adminEntry = tree.admin[0]?.entries[0];

  // Read branding only when nothing lands; the empty state is the one place that needs it.
  const branding =
    tree.landing === undefined ? await tenant.branding.get() : undefined;

  const contact = branding ? supportContact(branding) : null;

  return (
    <main data-context-id={contextId}>
      <h1>{t("title")}</h1>
      {tree.workspace.length > 0 && (
        <NavigationList
          heading={t("workspaceHeading")}
          items={tree.workspace}
          emptyMessage=""
        />
      )}
      {tree.categories
        .filter((group) => group.entries.length > 0)
        .map((group) => (
          <NavigationList
            key={group.id}
            heading={group.name}
            items={group.entries}
            emptyMessage=""
          />
        ))}
      {adminEntry && (
        <a href={adminEntry.path} className={focusRing}>
          {t("administration")}
        </a>
      )}
      {branding && (
        <NoGrantsEmptyState
          companyName={branding.companyName}
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
      )}
    </main>
  );
}
