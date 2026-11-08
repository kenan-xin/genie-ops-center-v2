import type { InspectorAccess } from "@genie/core/features/access";
import { useQuery } from "@tanstack/react-query";

import { rpc } from "../../../rpc/client.ts";
import { useRecordLabels } from "./use-record-labels.ts";

/**
 * The reads of the group inspector's Access tab, under the Access route's own query keys, so an
 * Access save refreshes them too. Without `core:roles:manage` nothing is read and the tab stays
 * hidden (LK5). No `placeholderData`, so a newly opened group never shows the paths of the one
 * before.
 */
export function useInspectorAccess(input: {
  readonly canManageAccess: boolean;
  readonly recipient: {
    readonly type: "group";
    readonly id: string;
  } | null;
  /** The sheet is open; a closed sheet reads nothing. */
  readonly open: boolean;
}): InspectorAccess | undefined {
  const { recipient } = input;

  const enabled = input.canManageAccess && input.open && recipient !== null;

  const paths = useQuery({
    queryKey: ["access", recipient?.type, recipient?.id],
    queryFn: () =>
      rpc.roles.recipientAccess({
        principalType: "group",
        principalId: recipient?.id ?? "",
      }),
    enabled,
  });

  const catalogue = useQuery({
    queryKey: ["access", "catalogue"],
    queryFn: () => rpc.roles.grantCatalogue(),
    enabled: input.canManageAccess,
  });

  const recordLabels = useRecordLabels(paths.data);

  if (!input.canManageAccess) return undefined;

  return {
    paths: paths.data,
    catalogue: catalogue.data,
    recordLabels,
    error:
      paths.isError || catalogue.isError
        ? "The access could not be read."
        : undefined,
  };
}

/**
 * The reads of the person inspector's Access tab, through the People read, so every viewer of
 * People sees the person's access read-only (LK4, changed by the owner on 2026-11-07, `d8l5.43`).
 * The key sits under ["access"], so every Access save and every People write refreshes it. Record
 * labels need `core:roles:manage`, so a people manager sees the id of a one-record scope (AD10).
 */
export function usePersonAccess(input: {
  readonly personId: string | null;
  /** The sheet is open; a closed sheet reads nothing. */
  readonly open: boolean;
  readonly canManageAccess: boolean;
}): InspectorAccess {
  const { personId } = input;

  const access = useQuery({
    queryKey: ["access", "person", personId],
    queryFn: () => rpc.people.access({ personId: personId ?? "" }),
    enabled: input.open && personId !== null,
  });

  const recordLabels = useRecordLabels(
    input.canManageAccess ? access.data?.paths : undefined
  );

  return {
    paths: access.data?.paths,
    catalogue: access.data?.catalogue,
    recordLabels,
    error: access.isError ? "The access could not be read." : undefined,
  };
}
