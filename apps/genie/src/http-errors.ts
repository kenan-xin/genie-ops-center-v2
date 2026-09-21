import { AppError, safeBodyFor } from "@genie/core";

/**
 * A `Map` rather than a `Record`, because an open dictionary type on the binding
 * discards the keys it holds and `anti-slop/no-known-value-widening` refuses it.
 */
const STATUS_BY_CODE = new Map<string, number>([
  ["not-found", 404],
  ["forbidden", 403],
  ["invalid-input", 400],
]);

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
    error instanceof AppError ? (STATUS_BY_CODE.get(error.code) ?? 500) : 500;

  return Response.json(body, { status });
}
