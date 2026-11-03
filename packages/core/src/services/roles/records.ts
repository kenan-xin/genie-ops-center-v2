import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { Scope } from "../../lib/module-contract/keys.ts";
import type { TenantContext } from "../../lib/tenant-context/index.ts";
import type { RequestPrincipal } from "../authorization/principal.ts";
import {
  readableRecords,
  recordKey,
} from "../authorization/readable-records.ts";
import { assertManagesAllRoles } from "./effective-access.ts";
import type { RolesModule } from "./index.ts";

/** The most records one picker search answers. */
export const RECORD_SEARCH_LIMIT = 20;

/** One record the scope picker offers. */
export type ScopeRecord = { readonly id: string; readonly label: string };

/** The label of one scope the caller may open. */
export type RecordLabel = {
  readonly type: string;
  readonly id: string;
  readonly label: string;
};

/**
 * The records of one record type that match a search, for the scope picker (R-37c, AD2). The
 * owning module answers ids; core resolves each one and keeps it only when the caller may open the
 * record under `can()` (R-69, AD3), in the module's order.
 */
export async function searchScopeRecords(input: {
  readonly tenant: TenantContext;
  readonly caller: RequestPrincipal;
  readonly modules: readonly RolesModule[];
  readonly recordType: string;
  readonly query: string;
}): Promise<readonly ScopeRecord[]> {
  await assertManagesAllRoles(input.caller);

  const { recordType } = input;

  const module = input.modules.find((candidate) =>
    candidate.recordTypes.some((entry) => entry.type === recordType)
  );

  const declared = module?.recordTypes.find(
    (entry) => entry.type === recordType
  );

  if (module === undefined || declared?.search === undefined) {
    throw new AppError(CORE_ERRORS["not-found"], {
      cause: new Error(`No searchable record type ${recordType}`),
    });
  }

  if (!(await input.tenant.entitlements.isEnabled(module.identity.id))) {
    throw new AppError(CORE_ERRORS["module-disabled"]);
  }

  const ids = await declared.search(
    { tenant: input.tenant },
    input.query.trim(),
    RECORD_SEARCH_LIMIT
  );

  const targets = ids.map((id) => ({ type: recordType, id }));
  const readable = await readableRecords(input.caller, input.modules, targets);

  return targets.flatMap((target) => {
    const found = readable.get(recordKey(target));

    return found?.exists === true
      ? [{ id: target.id, label: found.label }]
      : [];
  });
}

/** The labels of the scopes the caller may open (AD10); any other scope is left out. */
export async function readRecordLabels(input: {
  readonly caller: RequestPrincipal;
  readonly modules: readonly RolesModule[];
  readonly records: readonly Scope[];
}): Promise<readonly RecordLabel[]> {
  await assertManagesAllRoles(input.caller);

  const readable = await readableRecords(
    input.caller,
    input.modules,
    input.records
  );

  const seen = new Set<string>();

  return input.records.flatMap((record) => {
    const key = recordKey(record);
    const found = readable.get(key);

    if (seen.has(key) || found?.exists !== true) return [];

    seen.add(key);

    return [{ type: record.type, id: record.id, label: found.label }];
  });
}
