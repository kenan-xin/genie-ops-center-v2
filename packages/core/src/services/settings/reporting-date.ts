import type { TenantContext } from "../../lib/tenant-context/index.ts";

/** The reporting date (R-9): the stored date, or today in the tenant's default time zone when it is blank. */
export async function reportingDate(
  tenant: Pick<TenantContext, "settings" | "branding">,
  now: Date = new Date()
): Promise<string> {
  const [settings, branding] = await Promise.all([
    tenant.settings.get(),
    tenant.branding.get(),
  ]);

  return (
    settings.reportingDate ??
    new Intl.DateTimeFormat("en-CA", {
      timeZone: branding.defaultTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now)
  );
}
