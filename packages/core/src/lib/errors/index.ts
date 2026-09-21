/**
 * The one error catalogue (R-46). A code is stable, and its message is fixed, safe English that
 * a person outside the deployment may read. Upstream text, database text, a cause and a stack
 * trace stay in the server log and never reach a response body.
 *
 * Codes are kebab-case, because a module code is `<id>:<code>` and a module id is kebab-case.
 * A later section adds its codes here; a module raises `<id>:<code>` with its own safe message.
 */
export const CORE_ERROR_MESSAGES = {
  "internal-error":
    "Something went wrong. The support team can look it up by the request id.",
  "environment-invalid":
    "The deployment configuration is not valid. The server did not start.",
  "migration-lock-timeout":
    "The database migration lock was held by another start for too long.",
  "migration-failed":
    "A database migration did not finish. The database is unchanged.",
  "not-found": "That item does not exist, or you may not see it.",
  "forbidden": "You may not do that.",
  "invalid-input": "The request was not valid.",
} as const;

/** The entry an error outside the catalogue maps to (R-46). */
export const GENERIC_ERROR_CODE = "internal-error";

export type CoreErrorCode = keyof typeof CORE_ERROR_MESSAGES;

/** A core code, or a module's `<id>:<code>`. */
export type AppErrorCode = CoreErrorCode | (string & {});

/** The body an ordinary route handler returns (R-46). */
export type SafeErrorBody = {
  readonly code: string;
  readonly message: string;
  readonly requestId: string;
};

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** The catalogue keyed by an arbitrary code, which a module's `<id>:<code>` also is. */
const MESSAGES_BY_CODE = new Map(Object.entries(CORE_ERROR_MESSAGES));

/** The safe message of a code, or the generic one when the catalogue does not hold it. */
export function safeMessageFor(code: string): string {
  return MESSAGES_BY_CODE.get(code) ?? CORE_ERROR_MESSAGES[GENERIC_ERROR_CODE];
}

/** A module's error code, `<id>:<code>` (R-46). */
export function moduleErrorCode(moduleId: string, code: string): string {
  if (!KEBAB_CASE.test(moduleId)) {
    throw new Error(`Module id "${moduleId}" is not kebab-case.`);
  }

  if (!KEBAB_CASE.test(code)) {
    throw new Error(`Error code "${code}" is not kebab-case.`);
  }

  return `${moduleId}:${code}`;
}

/**
 * An error that carries a catalogue code. The cause is kept for the log and is never read by a
 * transport adapter, so wrapping an upstream failure loses no detail on the server side.
 */
export class AppError extends Error {
  readonly code: string;

  readonly safeMessage: string;

  constructor(
    code: AppErrorCode,
    options: { readonly cause?: unknown; readonly safeMessage?: string } = {}
  ) {
    const safeMessage = options.safeMessage ?? safeMessageFor(code);

    super(
      safeMessage,
      options.cause === undefined ? undefined : { cause: options.cause }
    );

    this.name = "AppError";
    this.code = code;
    this.safeMessage = safeMessage;
  }
}

/**
 * The body for one failed request. An error outside the catalogue becomes the generic entry
 * rather than its own message, so no exception text reaches a client (R-46).
 *
 * A transport narrows what it caught before it calls this: `caught instanceof Error ? caught :
 * undefined`. A value that is not an error carries no safe message either way.
 */
export function safeBodyFor(
  error: Error | undefined,
  requestId: string
): SafeErrorBody {
  if (error instanceof AppError) {
    return { code: error.code, message: error.safeMessage, requestId };
  }

  return {
    code: GENERIC_ERROR_CODE,
    message: CORE_ERROR_MESSAGES[GENERIC_ERROR_CODE],
    requestId,
  };
}
