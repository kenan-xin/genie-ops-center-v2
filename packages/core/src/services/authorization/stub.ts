import type { PermissionKey } from "../../lib/module-contract/keys.ts";
import type { GrantReader, PermissionGrants } from "./principal.ts";

/**
 * The one key Section 0 grants (R-13). Section 2 item 6 replaces this reader with the real
 * evaluator. There is no test principal and no read without a permission (DEC-34).
 */
export const STUB_GRANTED_KEY: PermissionKey = "placeholder:read";

export function createStubGrantReader(): GrantReader {
  const grants: PermissionGrants = {
    keys: new Set<PermissionKey>([STUB_GRANTED_KEY]),
    scopes: new Map([[STUB_GRANTED_KEY, { kind: "all" } as const]]),
  };

  return () => Promise.resolve(grants);
}
