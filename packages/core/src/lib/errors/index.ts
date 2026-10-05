/**
 * The one error catalogue (R-46). A code is stable, and its message is fixed, safe English that
 * a person outside the deployment may read. Upstream text, database text, a cause and a stack
 * trace stay in the server log and never reach a response body.
 *
 * Codes are kebab-case, because a module code is `<id>:<code>` and a module id is kebab-case.
 * A later section adds its codes here; a module raises `<id>:<code>` with its own safe message.
 */
export const CORE_ERROR_MESSAGES = Object.freeze({
  "internal-error":
    "Something went wrong. The support team can look it up by the request id.",
  "environment-invalid":
    "The deployment configuration is not valid. The server did not start.",
  "migration-lock-timeout":
    "The database migration lock was held by another start for too long.",
  "migration-failed":
    "A database migration did not finish. The server did not start.",
  "not-found": "That item does not exist, or you may not see it.",
  "forbidden": "You may not do that.",
  "unauthenticated": "You need to sign in to do that.",
  "invalid-input": "The request was not valid.",
  "module-disabled": "That module is switched off for this deployment.",
  "mail-not-configured":
    "Email is not configured for this deployment, so this action cannot send a notification.",
  "mail-delivery-failed":
    "The email could not be sent, so this action did not complete.",
  "mail-link-origin":
    "An action link in this email must point at this deployment's public address. The link and invitationUrl variables may carry a path or an absolute link on that address; no other address is sent.",
  "last-administrator":
    "That change would leave no active tenant administrator. Give the role to another active person first.",
  "self-protection": "You cannot remove your own tenant administrator access.",
  "group-seen":
    "A directory group that has been seen can only be archived, not deleted.",
  "system-role":
    "A system role cannot be edited or deleted. Copy it to change its permissions.",
  "role-name-taken": "A role with that name already exists.",
  "directory-group-exists":
    "A directory group with that exact claim value already exists.",
  "email-taken": "A person with that email already exists.",
  "rate-limited":
    "Too many attempts in a short time. Wait a few minutes and try again.",
  "local-accounts-unavailable":
    "Local accounts are not available in this realm, so this person cannot be created as a local account.",
  "realm-account-failed":
    "The identity provider could not create the account. Try again, or check the realm.",
} as const);

/** The entry an error outside the catalogue maps to (R-46). */
export const GENERIC_ERROR_CODE = "internal-error";

/**
 * The generic message, captured at load. Every path that answers for an unknown error reads
 * this, not the exported catalogue, so the message a client sees cannot be changed later. The
 * catalogue is frozen as well; this is the second lock on the one message nobody chose.
 */
const GENERIC_MESSAGE: string = CORE_ERROR_MESSAGES[GENERIC_ERROR_CODE];

export type CoreErrorCode = keyof typeof CORE_ERROR_MESSAGES;

/**
 * The mark a definition built here carries. The symbol is module-private and exported by no
 * entry point, so an ordinary object literal cannot hold it and a spread of a real definition
 * drops it. That separates a declared error from one assembled at a throw site out of whatever
 * text was at hand.
 *
 * It is a guard against a mistake, not a sandbox: `Object.getOwnPropertySymbols` on a real
 * definition finds the symbol, so code that sets out to defeat this can. The rule the guard
 * supports is the one that matters: a definition holds text its author wrote, never a value
 * from a request, a database or an upstream service.
 */
const DECLARED = Symbol("genie.error-definition");

/**
 * One error a caller may raise: a stable code with its fixed safe message. A definition is
 * written where the error is declared, in this file for core and through `defineModuleErrors`
 * for a module. It never carries a value from a request, a database or an upstream service.
 */
export type ErrorDefinition = {
  readonly code: string;
  readonly message: string;
  readonly [DECLARED]?: true;
};

/** The former name of `ErrorDefinition`, kept for the module-facing spelling. */
export type ModuleErrorDefinition = ErrorDefinition;

/** The body an ordinary route handler returns (R-46). */
export type SafeErrorBody = {
  readonly code: string;
  readonly message: string;
  readonly requestId: string;
};

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/**
 * Builds one frozen definition and marks it as declared. The mark is not enumerable, so an
 * object spread of a definition does not carry it: a copy with the message replaced is refused
 * like any other object a caller assembles.
 */
function declare(code: string, message: string): ErrorDefinition {
  const definition = { code, message };

  Object.defineProperty(definition, DECLARED, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  });

  return Object.freeze(definition);
}

/**
 * The core catalogue as definitions, which is what an error is raised with. Every entry is
 * frozen, so no later code can rewrite the message a client reads.
 */
// SAFETY: the entries come from CORE_ERROR_MESSAGES, so the keys are exactly its own and each
// value is the frozen definition built beside it. `fromEntries` cannot express that itself.
export const CORE_ERRORS = Object.freeze(
  Object.fromEntries(
    Object.entries(CORE_ERROR_MESSAGES).map(([code, message]) => [
      code,
      declare(code, message),
    ])
  )
) as Readonly<Record<CoreErrorCode, ErrorDefinition>>;

/** The catalogue keyed by an arbitrary code, which a module's `<id>:<code>` also is. */
const MESSAGES_BY_CODE = new Map(Object.entries(CORE_ERROR_MESSAGES));

/** The safe message of a code, or the generic one when the catalogue does not hold it. */
export function safeMessageFor(code: string): string {
  return MESSAGES_BY_CODE.get(code) ?? GENERIC_MESSAGE;
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
 * The errors one module can raise, each with its own fixed safe message. A module calls this
 * once where it declares itself, and raises `AppError` with one of the returned definitions.
 * The result is frozen and local to that module: no shared mutable registry exists, and a code
 * cannot be invented at the point where an error is thrown.
 */
export function defineModuleErrors<
  const TCodes extends Readonly<Record<string, string>>,
>(
  moduleId: string,
  messages: TCodes
): Readonly<Record<keyof TCodes, ErrorDefinition>> {
  const entries = Object.entries(messages).map(([code, message]) => {
    if (message.trim() === "") {
      throw new Error(`Error code "${code}" has no message.`);
    }

    return [code, declare(moduleErrorCode(moduleId, code), message)] as const;
  });

  // SAFETY: the entries are built from this object's own keys, one definition each, which is
  // the mapped type below. `fromEntries` widens the key type and cannot express it.
  return Object.freeze(Object.fromEntries(entries)) as Readonly<
    Record<keyof TCodes, ErrorDefinition>
  >;
}

/**
 * An error that carries a catalogue code. The cause is kept for the log and is never read by a
 * transport adapter, so wrapping an upstream failure loses no detail on the server side.
 */
export class AppError extends Error {
  /**
   * Both fields are fixed at construction with `defineProperty`, not assigned. A transport
   * reads them for the response body, so a later `Object.assign` must not be able to put a
   * database message into a client's hands. TypeScript's `readonly` is a compile-time rule
   * only; these are not writable and not configurable at run time either.
   */
  declare readonly code: string;

  declare readonly safeMessage: string;

  /**
   * The request this error answers, when the throw site knows it but the formatter does not. A
   * gate that throws before a transport builds its context attaches the id here, so the response
   * body and the log line still share one value (R-46, AC-15). Absent on an error raised where no
   * request exists; the transport then reads its own id.
   */
  declare readonly requestId: string | undefined;

  constructor(
    definition: ErrorDefinition,
    options: { readonly cause?: unknown; readonly requestId?: string } = {}
  ) {
    // Both halves reach a client, so neither may be assembled at the throw site. A core code
    // takes its message from the catalogue, whatever the caller supplied beside it. Any other
    // code must carry the private mark, which only defineModuleErrors can put there.
    const catalogued = MESSAGES_BY_CODE.get(definition.code);

    if (catalogued === undefined && definition[DECLARED] !== true) {
      throw new Error(
        `"${definition.code}" is not a declared error. Raise a core error from CORE_ERRORS, or a module error from defineModuleErrors.`
      );
    }

    const message = catalogued ?? definition.message;

    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause }
    );

    this.name = "AppError";

    for (const [name, value] of [
      ["code", definition.code],
      ["safeMessage", message],
      ["requestId", options.requestId],
    ] as const) {
      Object.defineProperty(this, name, {
        value,
        writable: false,
        configurable: false,
        enumerable: true,
      });
    }
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

  return { code: GENERIC_ERROR_CODE, message: GENERIC_MESSAGE, requestId };
}
