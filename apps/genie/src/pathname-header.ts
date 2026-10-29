/**
 * The request header the proxy sets to the request's own pathname.
 *
 * The module-disabled page reads it to choose its chrome, because a server component cannot read
 * the request's pathname from the framework alone. The shell reads `usePathname()` instead. The
 * proxy is the only writer.
 */
export const PATHNAME_HEADER = "x-genie-pathname";
