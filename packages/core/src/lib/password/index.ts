import { randomInt } from "node:crypto";

/**
 * The shared password rule (R-64) and the generator the `break_glass` setup step uses (R-57).
 *
 * R-64 is one rule for the client meter and the server check: at least 14 characters, three of
 * the four character classes (lower case, upper case, digit, symbol), not the account email, and
 * not the provisioning password. The last clause is a save-time check against the password the
 * account currently holds, so it is not part of this pure predicate: a caller that saves a
 * replacement compares the two itself. This module holds the rule both sides read and the one
 * generator a provisioning path uses; it depends on nothing but `node:crypto`.
 */

/** The R-64 minimum length. */
export const PASSWORD_MIN_LENGTH = 14;

/**
 * The four R-64 character classes. The symbol class leaves out `=` and whitespace so a generated
 * password can be printed on one line without looking like a `name=value` pair the log redactor
 * would replace (R-45).
 */
const CHARACTER_CLASSES = [
  "abcdefghijklmnopqrstuvwxyz",
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "0123456789",
  "!@#$%^&*()-_+[]{};:,.?/",
] as const;

const ALL_CHARACTERS = CHARACTER_CLASSES.join("");

/** The generated length: comfortably above the R-64 minimum, still human-copyable. */
const GENERATED_LENGTH = 20;

/** One character from a class, at random. */
function pick(characters: string): string {
  const value = characters[randomInt(characters.length)];

  if (value === undefined)
    throw new Error("cannot pick from an empty character class");

  return value;
}

/** A copy of `values` in random order (Fisher-Yates, `randomInt` as the unbiased source). */
function shuffled(values: readonly string[]): string[] {
  const result = [...values];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    const left = result[index];
    const right = result[swap];

    if (left === undefined || right === undefined) continue;

    result[index] = right;
    result[swap] = left;
  }

  return result;
}

/** How many of the four R-64 classes the password uses. */
export function characterClassCount(password: string): number {
  return CHARACTER_CLASSES.filter((characters) =>
    [...password].some((character) => characters.includes(character))
  ).length;
}

/**
 * The R-64 length, class and email clauses. It does not read the provisioning password, which is
 * the save-time fourth clause.
 */
export function meetsPasswordRule(password: string, email: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    characterClassCount(password) >= 3 &&
    password.toLowerCase() !== email.toLowerCase()
  );
}

/**
 * One generated password that meets R-64: every class is present, so three of four holds with room
 * to spare, and the length is `GENERATED_LENGTH`. A caller passes it through `meetsPasswordRule`
 * against the account email before writing it, because a generated value could coincide with the
 * email only in principle and the check is cheap.
 */
export function generatePassword(): string {
  const characters = CHARACTER_CLASSES.map((classCharacters) =>
    pick(classCharacters)
  );

  while (characters.length < GENERATED_LENGTH) {
    characters.push(pick(ALL_CHARACTERS));
  }

  return shuffled(characters).join("");
}
