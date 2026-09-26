/**
 * The line rules every log line of the image follows: the text redactor (R-45) and the pino level
 * numbers `LOG_LEVEL` selects by. The core logger imports them from here, and so does the
 * application's framework-console preload (`deploy/json-console.mjs`), which the image runs as this
 * same file under Node's type stripping. So this file imports nothing and uses erasable syntax only.
 */

/** pino's level numbers, the same mapping the core logger's `LOG_LEVEL` uses (index.test.ts). */
export const LEVEL_VALUES: ReadonlyMap<string, number> = new Map([
  ["trace", 10],
  ["debug", 20],
  ["info", 30],
  ["warn", 40],
  ["error", 50],
  ["fatal", 60],
  ["silent", Number.POSITIVE_INFINITY],
]);

export const REDACTED = "[redacted]";

/**
 * Field names whose value never reaches a log line, at any depth. Matching is on the name, so
 * `password`, `Password` and `user_password` are all caught (R-45).
 */
const SECRET_NAMES = [
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
  "credential",
  "apikey",
  "api_key",
  "databaseurl",
  "database_url",
  "connectionstring",
  "connection_string",
] as const;

/** Query parameters that turn a link into a credential, such as a set-password email link. */
const SECRET_PARAMETERS = [
  "token",
  "code",
  "password",
  "secret",
  "key",
  "signature",
];

/** Request header names whose value is a credential, however a message quotes one. */
const AUTH_HEADER_NAMES = ["authorization", "proxy-authorization"] as const;

/** Response and request cookie header names, whose whole value is credential material. */
const COOKIE_HEADER_NAMES = ["cookie", "set-cookie"] as const;

export function isSecretName(name: string): boolean {
  const plain = name.toLowerCase();

  return SECRET_NAMES.some((secret) => plain.includes(secret));
}

/**
 * True for a name that carries a credential wherever it is written: a structured field, a url
 * query name or a bare pair. It reads a query name by the same rule as a structured field, so
 * `Access_Token` and `client_secret` are classified like `access_token` and `password` (R-45).
 */
function isSecretParameter(name: string): boolean {
  const plain = name.toLowerCase();

  return (
    isSecretName(plain) ||
    SECRET_PARAMETERS.some((parameter) => parameter === plain)
  );
}

/** True for a url carrying a credential, in its query or in its userinfo. */
export function isSecretLink(value: string): boolean {
  if (!URL.canParse(value)) return false;

  const url = new URL(value);

  if (url.username !== "" || url.password !== "") return true;

  return [...url.searchParams.keys()].some(isSecretParameter);
}

/**
 * One `Authorization` header counted inside a message, to the end of its value. The scheme
 * names a way of presenting a credential, not the credential, so the whole value is redacted
 * whatever scheme it uses and however it is punctuated (R-45). The header name is kept, so the
 * line still says what happened.
 */
const AUTH_HEADER = new RegExp(
  `\\b(${AUTH_HEADER_NAMES.join("|")})\\b\\s*[:=]\\s*[^\\n]+`,
  "gi"
);

/** One `Cookie` header counted inside a message; its whole value runs to the line end. */
const COOKIE_HEADER = new RegExp(
  `\\b(${COOKIE_HEADER_NAMES.join("|")})\\b\\s*[:=]\\s*[^\\n]+`,
  "gi"
);

/**
 * A bearer credential written bare in a message, with no header name or `name=value` pair in
 * front of it. The scheme word names how the credential is presented, so it stays; the token
 * after it is the credential and is replaced (R-45). A token is at least twenty credential
 * characters, the same length the image scan uses, so an ordinary phrase such as `bearer of
 * bad news` has no token to match and is left alone.
 */
const BEARER_CREDENTIAL = /\b(bearer)\s+[A-Za-z0-9._~+/=-]{20,}/gi;

/**
 * Every url inside a piece of text, whatever its scheme. A credential-carrying url is not only
 * an http one: a database, queue or cache connection string carries userinfo or a secret query
 * parameter, so the scheme cannot be what decides (R-45).
 */
const URL_IN_TEXT = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)\]]+/gi;

/** A bare `name=value` pair, which a message can carry without a whole url. */
const SECRET_PAIR = /\b([A-Za-z0-9_.-]+)=([^\s&"']+)/g;

/**
 * Replaces the credentials a message quotes in a header, leaving the header name in place. The
 * value a header carries is a credential whenever it appears, not only when it sits in an
 * object a call site logged (R-45).
 */
function redactHeaders(text: string): string {
  return text
    .replace(AUTH_HEADER, `$1: ${REDACTED}`)
    .replace(COOKIE_HEADER, `$1: ${REDACTED}`);
}

/** Replaces the value of every bare `name=value` pair whose name carries a credential. */
function redactPairs(text: string): string {
  return text.replace(SECRET_PAIR, (pair, name: string) =>
    isSecretParameter(name) ? `${name}=${REDACTED}` : pair
  );
}

/**
 * Replaces a bearer credential written bare in a message, leaving the scheme word in place so
 * the line still says how the credential was presented. A header line is redacted whole before
 * this runs, so only a token with no header name in front of it reaches here (R-45).
 */
function redactBearerCredential(text: string): string {
  return text.replace(BEARER_CREDENTIAL, `$1 ${REDACTED}`);
}

/**
 * Replaces the secrets inside one piece of text: a quoted header, a url that carries a
 * credential, a bare bearer credential, and a bare `name=value` pair. A message string reaches
 * a log line as it was written, so the same rule has to run on it and not only on the object
 * beside it (R-45).
 */
export function redactText(text: string): string {
  return redactPairs(
    redactBearerCredential(
      redactHeaders(text).replace(URL_IN_TEXT, (link) =>
        isSecretLink(link) ? REDACTED : link
      )
    )
  );
}
