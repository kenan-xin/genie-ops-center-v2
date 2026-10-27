/**
 * The request header the proxy sets to the request's own pathname.
 *
 * `ShellFrame` reads it for the shell's current path, which a server component cannot read from
 * the framework alone. The proxy is the only writer.
 */
export const PATHNAME_HEADER = "x-genie-pathname";
