/**
 * The case names of the customer image matrix, shared by the test and the
 * mandatory manifest so a rename cannot silently detach the anti-skip guard.
 */
export const RELEASE_MATRIX_DESCRIBE = "the customer image matrix";

export const RELEASE_MATRIX_CASES = {
  development:
    "the development image serves the placeholder page, the health body and the standard headers",
  emptySelection:
    "an explicitly empty selection boots core-only with no placeholder route, table or migration file",
  twoSelections: "two different selections both build and start",
  content:
    "history and filesystem carry only MODULE_INCLUDE, no secret, no excluded module and no development-only tooling",
} as const;

/** The `describe > it` full names the manifest requires, in declaration order. */
export const RELEASE_MATRIX_FULL_NAMES: readonly string[] = Object.values(
  RELEASE_MATRIX_CASES
).map((name) => `${RELEASE_MATRIX_DESCRIBE} ${name}`);
