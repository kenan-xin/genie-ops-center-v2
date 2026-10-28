import {
  localAccountExists,
  localAccountsBesideSso,
  realmResetCredentialsUrl,
} from "@genie/core";
import { getTranslations } from "next-intl/server";

import { SSO_ENTRY, signInCause } from "../../auth.ts";
import { requireContext } from "../../context.ts";
import { SignInView } from "./sign-in-view.tsx";

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
 * Section 3 brands it (R-54): the product name in the heading, the company name as the mark's text,
 * a welcome text the tenant set, the system-use notice, the support contact and the terms and
 * privacy links come from branding. The primary pair comes from the root layout's token layer, the
 * background from `--sign-in-background`. The mark is the Ops Center default until an anonymous
 * branding image link exists (F-1); only `markUrl` changes then. No background image.
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
  const settings = await tenant.settings.get();

  const forgotPasswordUrl = realmResetCredentialsUrl({
    settings,
    publicUrl: tenant.env.publicUrl,
    realm: tenant.env.auth?.keycloakRealm,
    localAccountExists: await localAccountExists(tenant),
  });

  // R-17c: a brokered realm opened to local accounts offers SSO, with the provider hint, beside
  // the realm's own email and password form.
  const entries = localAccountsBesideSso(settings)
    ? {
        label: t("actionSso"),
        href: `/api/auth/sign-in/keycloak?entry=${SSO_ENTRY}`,
        passwordLabel: t("actionPassword"),
      }
    : {
        label: forgotPasswordUrl === null ? t("action") : t("actionLocal"),
      };

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
    <SignInView
      contextId={contextId}
      state={cause ?? DEFAULT_STATE}
      identity={{
        companyName: branding.companyName,
        productName: branding.productName,
        logoLightUrl: null,
        logoDarkUrl: null,
        markUrl: null,
      }}
      heading={t("heading", { productName: branding.productName })}
      // The owner removed the default welcome line; only a text the tenant set shows.
      welcome={present(branding.loginWelcomeText)}
      notice={
        banner === undefined
          ? null
          : {
              tone:
                cause !== undefined && WARNING_CAUSES.has(cause)
                  ? "warning"
                  : "info",
              text: banner,
            }
      }
      action={{
        notice: branding.loginNoticeText,
        requiresAcknowledgement: branding.loginNoticeRequiresAcknowledgement,
        ...entries,
        acknowledgeLabel: t("acknowledge"),
        forgotPasswordUrl,
        forgotPasswordLabel: t("forgotPassword"),
      }}
      footer={{
        supportEmail: branding.supportEmail,
        supportUrl: branding.supportUrl,
        termsUrl: branding.termsUrl,
        privacyUrl: branding.privacyUrl,
        termsLabel: t("terms"),
        privacyLabel: t("privacy"),
      }}
    />
  );
}
