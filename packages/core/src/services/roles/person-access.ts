import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import { can } from "../authorization/index.ts";
import type { RequestPrincipal } from "../authorization/principal.ts";
import { type AccessPath, recipientPaths } from "./effective-access.ts";
import { type GrantRow, grantRows } from "./grants.ts";
import type { RolesModule } from "./index.ts";

export type PersonAccess = {
  readonly paths: readonly AccessPath[];
  /** The Grants rows that name the modules of the paths. */
  readonly catalogue: readonly GrantRow[];
};

/**
 * LK4 (owner, 2026-11-07, `d8l5.43`): one person's paths, read-only, for the People inspector of
 * a holder of `core:people:manage`. It reads the same S2-19 paths as Grants (R-37d), and opens
 * nothing else of Access, which stays behind `core:roles:manage` (R-37e).
 */
export async function readPersonAccess(input: {
  readonly tenant: TenantContext;
  readonly caller: RequestPrincipal;
  readonly modules: readonly RolesModule[];
  readonly personId: string;
}): Promise<PersonAccess> {
  if (!(await can(input.caller, "core:people:manage"))) {
    throw new AppError(CORE_ERRORS.forbidden);
  }

  const [paths, catalogue] = await Promise.all([
    recipientPaths(input.tenant, input.modules, {
      type: "user",
      id: input.personId,
    }),
    grantRows(input.tenant, input.modules),
  ]);

  return { paths, catalogue };
}
