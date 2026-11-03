/**
 * One `ILIKE` pattern for a literal search term. `%`, `_` and the backslash are escaped and the
 * pattern is used with `ESCAPE '\'`, so a search for `_` or `%` matches those characters literally
 * rather than turning into a wildcard (R-67).
 */
export function likePattern(query: string): string {
  const escaped = query.replace(/[\\%_]/g, (character) => `\\${character}`);

  return `%${escaped}%`;
}
