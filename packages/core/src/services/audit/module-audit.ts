import type { ResourceRef } from "../../lib/module-contract/keys.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import type { TenantTransaction } from "../../lib/tenant-context/with-transaction.ts";
import type { RequestPrincipal } from "../authorization/index.ts";
import type { AuditMetadataValue } from "./index.ts";
import { insertAuditRow } from "./insert.ts";

export type ModuleAuditContext = {
  readonly tenant: TenantContext;
  /** The acting person. Without one, the row has a null actor (a system job). */
  readonly caller?: RequestPrincipal;
  /** The caller's own transaction, so the row commits or rolls back with the write it records. */
  readonly tx?: TenantTransaction;
};

export type ModuleAudit<TModuleId extends string> = (
  ctx: ModuleAuditContext,
  action: `${TModuleId}:${string}`,
  target: ResourceRef | null,
  summary: string,
  metadata?: Readonly<Record<string, AuditMetadataValue>>
) => Promise<void>;

/** The module audit call (R-10), bound to one module, so every action carries its prefix. */
export function moduleAudit<const TModuleId extends string>(
  moduleId: TModuleId
): ModuleAudit<TModuleId> {
  return async (ctx, action, target, summary, metadata) => {
    if (!action.startsWith(`${moduleId}:`)) {
      throw new Error(
        `The audit action "${action}" does not start with "${moduleId}:".`
      );
    }

    await insertAuditRow(ctx.tx ?? ctx.tenant.db, {
      // An anonymous caller is not an actor: the column references `user.id`, so `""` would
      // fail the foreign key instead of recording a system row.
      actorUserId:
        ctx.caller?.authenticated === true ? ctx.caller.userId : null,
      action,
      targetType: target?.type,
      targetId: target?.id,
      summary,
      metadata,
    });
  };
}
