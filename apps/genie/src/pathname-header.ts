/**
 * The request header the proxy sets to the request's own pathname.
 *
 * The root layout reads it to decide whether a limited break-glass session may render the page it
 * asked for: every route answers the limited-session page except the break-glass door itself, so
 * the layout needs the pathname, which a server component cannot read from the framework alone
 * (R-30, R-65). The proxy is the only writer.
 */
export const PATHNAME_HEADER = "x-genie-pathname";
