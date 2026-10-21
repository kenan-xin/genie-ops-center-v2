/**
 * The pure half of the shared password rule (R-64): the parts the browser meter and the server
 * check both read. It imports nothing, so the Account and break-glass features can render the
 * meter without reaching `node:crypto` or a database.
 *
 * The rule is at least 14 characters, three of the four character classes (lower case, upper
 * case, digit, symbol), and the password is not the account email. The fourth clause (not the
 * provisioning password) is a save-time comparison against the password the account currently
 * holds, so it is not part of this predicate; the meter shows it neutral and the server compares
 * the two values itself.
 */

/** The R-64 minimum length. */
export const PASSWORD_MIN_LENGTH = 14;

/**
 * The four R-64 character classes. The symbol class leaves out `=` and whitespace so a generated
 * password can be printed on one line without looking like a `name=value` pair the log redactor
 * would replace (R-45).
 */
export const PASSWORD_CHARACTER_CLASSES = [
  "abcdefghijklmnopqrstuvwxyz",
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "0123456789",
  "!@#$%^&*()-_+[]{};:,.?/",
] as const;

/** How many of the four R-64 classes the password uses. */
export function characterClassCount(password: string): number {
  return PASSWORD_CHARACTER_CLASSES.filter((characters) =>
    [...password].some((character) => characters.includes(character))
  ).length;
}

/** The three predicate clauses of R-64 the meter can check as the person types. */
export function meetsPasswordRule(password: string, email: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    characterClassCount(password) >= 3 &&
    password.toLowerCase() !== email.toLowerCase()
  );
}

/**
 * One row of the client meter (R-64): the three live rules and the save-time provisioning rule,
 * which is neutral until submit. `met` is `null` for a rule the meter never marks.
 */
export type PasswordRuleRow = {
  readonly key: "length" | "classes" | "notEmail" | "notProvisioning";
  readonly met: boolean | null;
};

/** The four meter rows in display order, the last neutral (R-64, design spec). */
export function passwordRuleRows(
  password: string,
  email: string
): PasswordRuleRow[] {
  return [
    { key: "length", met: password.length >= PASSWORD_MIN_LENGTH },
    { key: "classes", met: characterClassCount(password) >= 3 },
    {
      key: "notEmail",
      met:
        password.length === 0
          ? null
          : password.toLowerCase() !== email.toLowerCase(),
    },
    { key: "notProvisioning", met: null },
  ];
}
