/**
 * The display name a pre-added person carries before the identity provider supplies one (R-56,
 * R-57). Setup reads only an address, so its local part is the placeholder until the person signs
 * in and the provider's profile replaces it. An address always has a non-empty local part, but the
 * full address is the fallback so the `name` column is never blank.
 */
export function nameForEmail(email: string): string {
  const [localPart] = email.split("@");

  return localPart === undefined || localPart === "" ? email : localPart;
}
