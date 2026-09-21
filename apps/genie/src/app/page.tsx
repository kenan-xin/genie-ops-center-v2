import { getTranslations } from "next-intl/server";

/**
 * The landing page. Section 0 has no workspace yet, so the one string it shows
 * comes from the catalogue (DEC-13). Task 6 replaces this with the real page.
 */
export default async function HomePage() {
  const t = await getTranslations("app");

  return <main>{t("title")}</main>;
}
