import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

/**
 * The sign-in page (R-17a). Section 2 owns its behavior and Section 3 its presentation; this is
 * the fixed layer: the default state, a named banner per refusal cause, and one action that starts
 * the Keycloak sign-in. Copy never says whether an email exists.
 *
 * The five states each have one cause: the default state; signed out after R-17; session expired
 * after R-14; not registered after the R-9 refusal; access disabled after the R-11 refusal. The
 * OAuth refusal codes reach this page through `errorCallbackURL`.
 */
const DEFAULT_STATE = "default";

type SignInCause =
  | "keycloak_unavailable"
  | "not_registered"
  | "access_disabled"
  | "session_expired"
  | "session_missing";

function causeFrom(error: string | undefined): SignInCause | undefined {
  switch (error) {
    case "keycloak_unavailable":
    case "not_registered":
    case "access_disabled":
    case "session_expired":
    case "session_missing":
      return error;
    default:
      return undefined;
  }
}

export default async function SignInPage(props: {
  readonly searchParams: Promise<{ readonly error?: string }>;
}) {
  const { error } = await props.searchParams;
  const t = await getTranslations("signIn");

  const cause = causeFrom(error);

  // Each cause is its own catalogue call rather than a computed key, so the catalogue-coverage
  // check can read the literal key out of this file.
  const banner =
    cause === "keycloak_unavailable"
      ? t("errors.keycloakUnavailable")
      : cause === "not_registered"
        ? t("errors.notRegistered")
        : cause === "access_disabled"
          ? t("errors.accessDisabled")
          : cause === "session_expired"
            ? t("errors.sessionExpired")
            : cause === "session_missing"
              ? t("errors.sessionMissing")
              : undefined;

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
