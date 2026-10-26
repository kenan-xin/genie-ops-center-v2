/**
 * Error-cause helpers shared by the operator command line and the services. A driver error
 * reaches a caller wrapped by drizzle, whose own message carries the SQL and its parameters; the
 * caller needs the cause underneath it instead.
 */

/**
 * Every message in an error's cause chain, outermost first, each visited once. The command's
 * failing path prints this, so the database's own text arrives beside the wrapped message
 * (R-76).
 */
export function causeChain(error: Error | undefined): string {
  const messages: string[] = [];
  const seen = new Set<Error>();

  let current = error;

  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    messages.push(current.message);

    const cause: unknown = current.cause;

    current = cause instanceof Error ? cause : undefined;
  }

  return messages.join(": ");
}

/**
 * The Postgres error code of a failed write, or `undefined` for anything else. drizzle-orm
 * 0.45.2 wraps a failed query in `DrizzleQueryError`, which carries no `code` of its own; the
 * driver's pg error, and its `code`, sits on `.cause`. So the chain is walked, not just the top
 * error. Only the code reaches the fallback line: the message and every value (drizzle's
 * wrapper message holds the SQL and the parameters) stay in the server log (R-45, R-66).
 */
export function pgErrorCode(error: Error | undefined): string | undefined {
  for (let current = error; current !== undefined;) {
    if ("code" in current) {
      const code: unknown = current.code;

      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the boundary parse of a driver error
      if (typeof code === "string") return code;
    }

    current = current.cause instanceof Error ? current.cause : undefined;
  }

  return undefined;
}

/**
 * The innermost message in an error's cause chain: the driver's own text with no wrapper above
 * it, so a persisted step detail never repeats drizzle's SQL and parameters (R-66, R-77).
 */
export function rootCauseMessage(error: Error | undefined): string {
  const seen = new Set<Error>();

  let current = error;
  let message = error?.message ?? "the step failed without an error";

  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    message = current.message;

    const cause: unknown = current.cause;

    current = cause instanceof Error ? cause : undefined;
  }

  return message;
}
