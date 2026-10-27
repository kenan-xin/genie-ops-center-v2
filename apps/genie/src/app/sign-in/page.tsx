import { localAccountExists, realmResetCredentialsUrl } from "@genie/core";
import { InfoNote, WarningNote } from "@genie/ui";
import { getTranslations } from "next-intl/server";

import { signInCause } from "../../auth.ts";
import { requireContext } from "../../context.ts";
import { SignInAction } from "./sign-in-action.tsx";
import { SignInFooter } from "./sign-in-footer.tsx";

export const dynamic = "force-dynamic";

/**
 * The sign-in page (R-17a). Section 2 owns its behavior and Section 3 its presentation; this is
 * the fixed layer: the default state, a named banner per refusal cause, and one action that starts
 * the Keycloak sign-in. Copy never says whether an email exists.
 *
 * The five states each have one cause: the default state; signed out after R-17 (`signed_out`,
 * which sign-out sends directly or the realm hands back through the home page); session expired
 * after R-14; not registered after the R-9 refusal; access disabled after the R-11 refusal. The
 * OAuth refusal codes reach this page through `errorCallbackURL`, and `signInCause` maps each one
 * to the state a person can act on. The session-expired banner names the tenant's idle minutes,
 * read through the settings reader (R-14).
 *
 * Section 3 brands it as text and color only (R-54): company and product names, welcome text,
 * the system-use notice, the support contact and the terms and privacy links come from branding.
 * The primary pair comes from the root layout's token layer, the background from
 * `--sign-in-background`. No logo and no background image (F-1).
 */
const DEFAULT_STATE = "default";

/** Causes that refuse or fail the sign-in; the rest only explain a state (design `tone`). */
const WARNING_CAUSES = new Set([
  "keycloak_unavailable",
  "keycloak_issuer_mismatch",
  "not_registered",
  "access_disabled",
]);

/**
 * The product name for the client-only signed-out copy, or undefined in managed mode. In
 * client-only mode only the Genie Ops Center session ended, so the copy says the company sign-in
 * stays active (R-17, ADR 0010).
 */
async function clientOnlyProductName(
  productName: string
): Promise<string | undefined> {
  const { realmMode } = await requireContext().tenant.settings.get();

  return realmMode === "customer" ? productName : undefined;
}

/** A branding text value, or null when it is unset or blank. */
function present(value: string | null): string | null {
  return value === null || value.trim() === "" ? null : value;
}

export default async function SignInPage(props: {
  readonly searchParams: Promise<{ readonly error?: string }>;
}) {
  const { error } = await props.searchParams;
  const t = await getTranslations("signIn");

  const cause = signInCause(error);

  const { contextId, tenant } = requireContext();

  const branding = await tenant.branding.get();

  // R-51a: a local-accounts realm gets its own button label and the realm's reset-password link,
  // kept after the setting is turned off while any local account exists.
  const forgotPasswordUrl = realmResetCredentialsUrl({
    settings: await tenant.settings.get(),
    publicUrl: tenant.env.publicUrl,
    realm: tenant.env.auth?.keycloakRealm,
    localAccountExists: await localAccountExists(tenant),
  });

  const productName =
    cause === "signed_out"
      ? await clientOnlyProductName(branding.productName)
      : undefined;

  // Each cause is its own catalogue call rather than a computed key, so the catalogue-coverage
  // check can read the literal key out of this file.
  const banner =
    cause === "keycloak_unavailable"
      ? t("errors.keycloakUnavailable")
      : cause === "keycloak_issuer_mismatch"
        ? t("errors.keycloakIssuerMismatch")
        : cause === "not_registered"
          ? t("errors.notRegistered")
          : cause === "access_disabled"
            ? t("errors.accessDisabled")
            : cause === "session_expired"
              ? t("errors.sessionExpired", {
                  minutes: (await requireContext().tenant.settings.get())
                    .sessionIdleMinutes,
                })
              : cause === "session_missing"
                ? t("errors.sessionMissing")
                : cause !== "signed_out"
                  ? undefined
                  : productName === undefined
                    ? t("errors.signedOut")
                    : t("errors.signedOutClientOnly", { productName });

  return (
    <main
      // AC-26: the anonymous page bundle stamps the context id it read (the home page redirects here).
      data-context-id={contextId}
      data-sign-in-state={cause ?? DEFAULT_STATE}
      className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-sign-in-background px-4 py-12 dark:bg-background"
    >
      <div className="text-center">
        <h1 className="text-lg font-semibold text-foreground">
          {branding.companyName}
        </h1>
        <p className="text-xs text-muted-foreground">{branding.productName}</p>
      </div>
      <section className="flex w-full max-w-md flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        {banner === undefined ? null : (
          // A refusal is an amber alert; an expired or signed-out session is a blue status.
          <div data-testid="sign-in-banner">
            {cause !== undefined && WARNING_CAUSES.has(cause) ? (
              <WarningNote size="md" role="alert">
                {banner}
              </WarningNote>
            ) : (
              <InfoNote size="md" role="status">
                {banner}
              </InfoNote>
            )}
          </div>
        )}
        <h2 className="text-2xl font-semibold text-foreground">{t("title")}</h2>
        <p data-testid="sign-in-welcome" className="text-muted-foreground">
          {present(branding.loginWelcomeText) ??
            t("welcomeFallback", { productName: branding.productName })}
        </p>
        <SignInAction
          notice={branding.loginNoticeText}
          requiresAcknowledgement={branding.loginNoticeRequiresAcknowledgement}
          label={forgotPasswordUrl === null ? t("action") : t("actionLocal")}
          acknowledgeLabel={t("acknowledge")}
          forgotPasswordUrl={forgotPasswordUrl}
          forgotPasswordLabel={t("forgotPassword")}
        />
      </section>
      <SignInFooter
        productName={branding.productName}
        supportEmail={branding.supportEmail}
        supportUrl={branding.supportUrl}
        termsUrl={branding.termsUrl}
        privacyUrl={branding.privacyUrl}
        termsLabel={t("terms")}
        privacyLabel={t("privacy")}
      />
    </main>
  );
}
