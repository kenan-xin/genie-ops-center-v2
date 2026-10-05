import { permittedNavigation } from "@genie/core";
import { NavigationList } from "@genie/ui";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers.js";
import { redirect } from "next/navigation.js";

import { SIGNED_OUT, SIGNED_OUT_PATH } from "../auth.ts";
import { requireContext } from "../context.ts";
import { modules } from "../registry.ts";
import { requestPrincipal } from "../request-principal.ts";

export const dynamic = "force-dynamic";

/**
 * The ordinary document. Navigation hides every module whose entitlement is off (R-8) and every
 * entry whose permission the person does not hold (R-34). Hiding is not the enforcement: each
 * route still refuses in its own `can()` check (R-35).
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

  const entries = await permittedNavigation({
    entitlements: tenant.entitlements,
    modules,
    caller: await requestPrincipal(tenant, await headers()),
  });

  const items = entries.map((entry) => ({
    id: entry.id,
    label: entry.label,
    path: entry.path,
  }));

  return (
    <main data-context-id={contextId}>
      <h1>{t("title")}</h1>
      <NavigationList
        heading={t("navigationHeading")}
        items={items}
        emptyMessage={t("noModules")}
      />
    </main>
  );
}
