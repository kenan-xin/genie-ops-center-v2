import type { InspectorAccess } from "@genie/core/features/access";
import { useQuery } from "@tanstack/react-query";

import { rpc } from "../../../rpc/client.ts";
import { useRecordLabels } from "./use-record-labels.ts";

/**
 * The reads of an inspector Access tab, under the Access route's own query keys, so an Access save
 * refreshes them too. Without `core:roles:manage` nothing is read and the tab stays hidden (LK4,
 * LK5). No `placeholderData`, so a newly opened recipient never shows the paths of the one before.
 */
export function useInspectorAccess(input: {
  readonly canManageAccess: boolean;
  readonly recipient: {
    readonly type: "user" | "group";
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
        principalType: recipient?.type ?? "group",
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
