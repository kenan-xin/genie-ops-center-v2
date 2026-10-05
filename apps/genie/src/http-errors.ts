import { AppError, safeBodyFor } from "@genie/core";

/**
 * A `Map` rather than a `Record`, because an open dictionary type on the binding
 * discards the keys it holds and `anti-slop/no-known-value-widening` refuses it.
 */
const STATUS_BY_CODE = new Map<string, number>([
  ["not-found", 404],
  ["forbidden", 403],
  ["unauthenticated", 401],
  ["module-disabled", 403],
  ["invalid-input", 400],
  ["email-taken", 400],
  ["local-accounts-unavailable", 400],
  ["rate-limited", 429],
]);

/**
 * The one status mapping of R-46: a catalogue code's HTTP status, or 500 for a
 * code the table does not hold (a module code, or the generic entry). The tRPC
 * error formatter reads the same function, so a procedure and an ordinary route
 * answer the same status for the same code.
 */
export function httpStatusForCode(code: string): number {
  return STATUS_BY_CODE.get(code) ?? 500;
}

/**
 * The one route-handler helper of R-46. The response body carries the catalogue
 * code, its fixed safe message and the request id that matches the server log.
 * A cause, a stack, database text and upstream text stay on the server.
 *
 * The parameter is named `cause`, the one name `anti-slop/no-unknown-parameters`
 * allows an `unknown` input to carry: a caught value has no parsed type, and the
 * narrowing below is what makes it safe.
 */
export function errorResponse(cause: unknown, requestId: string): Response {
  const error = cause instanceof Error ? cause : undefined;
  const body = safeBodyFor(error, requestId);

  const status =
    error instanceof AppError ? httpStatusForCode(error.code) : 500;

  return Response.json(body, { status });
}
