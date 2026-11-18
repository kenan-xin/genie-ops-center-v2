import {
  addedMessage,
  namesOf,
  pickedRole,
  refusalMessage,
  roleChoices,
  type AddAssignmentHost,
  type AddAssignmentInput,
  type InspectorAccess,
} from "@genie/core/features/access";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { useAdminWrite } from "../../../rpc/admin-write.ts";
import { rpc, type Refusal } from "../../../rpc/client.ts";

/** The record picker of the one form: a search repeated within half a minute reads the cache. */
const RECORD_SEARCH_STALE_MS = 30_000;

/**
 * Add assignment's reads and write (d8l5.62): the role list, the record search through the form,
 * and `roles.assignMany` with the success toast and the refusal line. Given only to a tenant-wide
 * roles manager (P12-2), and undefined until the three reads answer.
 */
export function useAddAssignment(input: {
  readonly enabled: boolean;
  /** A sheet's own person or group, with its paths, for "Already assigned" (P12-22). */
  readonly recipient?:
    | { readonly type: "user" | "group"; readonly id: string }
    | undefined;
  readonly paths?: InspectorAccess["paths"];
}): AddAssignmentHost | undefined {
  const queryClient = useQueryClient();

  const roles = useQuery({
    queryKey: ["roles"],
    queryFn: () => rpc.roles.list(),
    enabled: input.enabled,
  });

  const catalogue = useQuery({
    queryKey: ["access", "catalogue"],
    queryFn: () => rpc.roles.grantCatalogue(),
    enabled: input.enabled,
  });

  const advanced = useQuery({
    queryKey: ["access", "advanced", "catalogue"],
    queryFn: () => rpc.roles.advancedCatalogue(),
    enabled: input.enabled,
  });

  const groups = useMemo(() => {
    const base = {
      roles: roles.data ?? [],
      catalogue: catalogue.data ?? [],
      advanced: advanced.data ?? { core: [], record: [], custom: [] },
    };

    return input.paths === undefined || input.recipient === undefined
      ? roleChoices(base)
      : roleChoices({
          ...base,
          paths: input.paths,
          recipient: input.recipient,
        });
  }, [roles.data, catalogue.data, advanced.data, input.paths, input.recipient]);

  const write = useAdminWrite({
    write: (add: AddAssignmentInput) =>
      rpc.roles.assignMany({
        roleId: add.roleId,
        scope: add.scope,
        recipients: add.recipients.map(({ type, id }) => ({ type, id })),
      }),
    // The paths, the Overview, the group card's count and the roles' counts all change; the navigation can too.
    invalidate: [["access"], ["groups"], ["group"], ["roles"]],
    refresh: true,
    saved: (result, add) =>
      addedMessage(
        pickedRole(groups, add.roleId).name,
        namesOf(
          result.added.map((added) => added.recipient),
          add.recipients
        ),
        namesOf(result.skipped, add.recipients)
      ),
    refused: () => undefined,
  });

  if (
    !input.enabled ||
    roles.data === undefined ||
    catalogue.data === undefined ||
    advanced.data === undefined
  )
    return undefined;

  return {
    roles: groups,
    onSearchRecords: (recordType, query) =>
      queryClient.fetchQuery({
        queryKey: ["access", "records", recordType, query],
        queryFn: () => rpc.roles.scopeRecords({ recordType, query }),
        staleTime: RECORD_SEARCH_STALE_MS,
      }),
    onSubmit: async (add) => {
      try {
        return await write.mutateAsync(add);
      } catch (cause) {
        // SAFETY: `adminWriteOptions` rejects with a `Refusal`.
        const refusal = cause as Refusal;

        throw {
          message: refusalMessage(
            refusal.code,
            refusal.message,
            pickedRole(groups, add.roleId).moduleName
          ),
        };
      }
    },
  };
}
