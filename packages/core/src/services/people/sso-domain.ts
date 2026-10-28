/**
 * Whether an address sits on one of the identity provider's email domains or on a subdomain of
 * one (R-40b). The domains are lower case, as `genie-ops realm local-accounts enable` stores them.
 */
export function onSsoDomain(
  email: string,
  domains: readonly string[]
): boolean {
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();

  return domains.some(
    (entry) => domain === entry || domain.endsWith(`.${entry}`)
  );
}
