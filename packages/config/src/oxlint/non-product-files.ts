/**
 * The paths that are not the shipping surface: colocated tests, stories, and
 * fixtures. The shadcn override turns its design-system rules off for them, and
 * the test-only import ban exempts them. One list, so the two cannot drift.
 */
export const NON_PRODUCT_FILE_PATTERNS: readonly string[] = [
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.stories.ts",
  "**/*.stories.tsx",
  "**/testing/**",
  "**/__fixtures__/**",
];
