import { scopeKey } from "@genie/core/features/access";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { rpc } from "../../../rpc/client.ts";

type Path = Awaited<ReturnType<typeof rpc.roles.recipientAccess>>[number];

/** The most scopes one labels read takes (the `roles.recordLabels` input limit). */
const LABELS_LIMIT = 100;

/**
 * The labels of the records that the paths are scoped to, keyed by `scopeKey` (AD10). The server
 * answers only the records the caller can open, so any other scope keeps showing its id.
 */
export function useRecordLabels(
  paths: readonly Path[] | undefined
): ReadonlyMap<string, string> {
  const scopes = [
    ...new Map(
      (paths ?? []).flatMap((path) =>
        path.scope === null ? [] : [[scopeKey(path.scope), path.scope] as const]
      )
    ).values(),
  ]
    // shortcut: past 100 scoped paths the rest show their ids; page the read if a recipient holds more.
    .slice(0, LABELS_LIMIT);

  const labels = useQuery({
    queryKey: ["access", "labels", ...scopes.map(scopeKey)],
    queryFn: () => rpc.roles.recordLabels({ records: scopes }),
    enabled: scopes.length > 0,
  });

  return useMemo(
    () =>
      new Map(
        (labels.data ?? []).map((entry) => [scopeKey(entry), entry.label])
      ),
    [labels.data]
  );
}
