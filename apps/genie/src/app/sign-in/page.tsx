import { getTranslations } from "next-intl/server";

import { signInCause } from "../../auth.ts";
import { requireContext } from "../../context.ts";

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
 */
const DEFAULT_STATE = "default";

/**
 * The product name for the client-only signed-out copy, or undefined in managed mode. In
 * client-only mode only the Genie Ops Center session ended, so the copy says the company sign-in
 * stays active (R-17, ADR 0010).
 */
async function clientOnlyProductName(): Promise<string | undefined> {
  const { tenant } = requireContext();
  const { realmMode } = await tenant.settings.get();

  return realmMode === "customer"
    ? (await tenant.branding.get()).productName
    : undefined;
}

export default async function SignInPage(props: {
  readonly searchParams: Promise<{ readonly error?: string }>;
}) {
  const { error } = await props.searchParams;
  const t = await getTranslations("signIn");

  const cause = signInCause(error);

  const productName =
    cause === "signed_out" ? await clientOnlyProductName() : undefined;

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
    <main data-sign-in-state={cause ?? DEFAULT_STATE}>
      <h1>{t("title")}</h1>
      {banner === undefined ? null : (
        <p role="alert" data-testid="sign-in-banner">
          {banner}
        </p>
      )}
      <a href="/api/auth/sign-in/keycloak">{t("action")}</a>
    </main>
  );
}
