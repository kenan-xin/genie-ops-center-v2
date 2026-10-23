/**
 * The tenant letter: the first character of the company name, upper-cased, or undefined for a
 * blank name. `Array.from` splits by code point, so a leading emoji stays whole.
 */
export function tenantInitial(companyName: string): string | undefined {
  return Array.from(companyName.trim())[0]?.toLocaleUpperCase();
}
