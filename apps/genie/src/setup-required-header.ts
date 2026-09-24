/**
 * The request header the proxy sets when it rewrites a document to the not-set-up route (D-2).
 *
 * The root layout reads it and withholds the next-intl message catalogue, so the standalone page
 * carries none of the application's own shell strings — the flight payload otherwise serializes
 * every namespace, including the viewer and shell labels the page must not show (R-16). The route
 * stays a normal styled page rather than a hand-built response.
 */
export const SETUP_REQUIRED_HEADER = "x-genie-setup-required";
