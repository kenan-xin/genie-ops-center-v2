/**
 * Error-cause helpers shared by the operator command line. A driver error reaches a caller
 * wrapped by drizzle, whose own message carries the SQL and its parameters; the operator needs
 * the cause underneath it instead.
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
