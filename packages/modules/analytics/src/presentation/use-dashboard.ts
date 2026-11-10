"use client";

import type { PanelConfig } from "@genie/core";
import { useModuleClient } from "@genie/core/rpc/client";
import { type ChartData, useAddressParams } from "@genie/ui";
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useMemo } from "react";

import {
  analyticsContract,
  type DashboardChange,
  type DashboardFilters,
  type DateRangeFilter,
  type PanelLayout,
} from "../contract.ts";
import {
  ADDRESS,
  addressNames,
  fieldNamesOf,
  readFilterAddress,
  sameFilters,
  writeFilterAddress,
} from "./filter-address.ts";
import type { DashboardView } from "./views.ts";

export const dashboardQueryKey = (id: string) =>
  ["analytics", "dashboard", id] as const;

/** The filters are in the key, so an answer of other filters never stands in for these (S7-46). */
export const panelQueryKey = (
  id: string,
  panelId: string,
  version: number,
  filters: DashboardFilters
) => ["analytics", "panel", id, panelId, version, filters] as const;

export type DashboardFilterState = {
  /** The address filters, or the stored ones when the address holds none. */
  readonly filters: DashboardFilters;
  /** Whether the filters come from the address, so a read sends them. */
  readonly fromAddress: boolean;
  /** Writes `next` to the address; nothing is saved (S7-46). */
  readonly set: (next: DashboardFilters) => void;
  /** Clears the address, so the page reads the stored filters. */
  readonly reset: () => void;
};

/** The dashboard filters the page applies: the address first, else the stored ones (S7-46). */
export function useDashboardFilters(
  dashboard: DashboardView
): DashboardFilterState {
  // The `f.<field>` names are known only once `fields` is read (Task 3 review M1).
  const first = useAddressParams([ADDRESS.range, ADDRESS.fields]);
  const names = addressNames(first.params);
  const address = useAddressParams(names);
  const { params } = address;

  return useMemo(() => {
    const read = readFilterAddress(params, dashboard.filterFields);

    return {
      filters: read ?? dashboard.filters,
      fromAddress: read !== null,
      set: (next) =>
        address.set(
          writeFilterAddress(next, fieldNamesOf(params[ADDRESS.fields]))
        ),
      reset: () =>
        address.set(
          Object.fromEntries(
            addressNames(params).map((name) => [name, undefined])
          )
        ),
    };
  }, [address, params, dashboard.filters, dashboard.filterFields]);
}

/** The server's answer before the browser narrows each panel config (Global Constraints). */
type SavedDashboard = Omit<DashboardView, "panels"> & {
  readonly panels: readonly {
    readonly id: string;
    readonly layout: PanelLayout;
    readonly config: unknown;
    readonly ownRange?: DateRangeFilter | undefined;
  }[];
};

function narrowDashboard(view: SavedDashboard): DashboardView {
  return {
    ...view,
    panels: view.panels.map((panel) => ({
      ...panel,
      // SAFETY: the server stored every panel config after `checkChart` parsed it (R-15).
      config: panel.config as PanelConfig,
    })),
  };
}

/**
 * One dashboard as the page reads it, starting from the loader's answer. It asks again every 10
 * seconds and on focus, so a change from Ask, another tab or a chat whose follow-up failed shows.
 */
export function useDashboard(
  initial: DashboardView
): UseQueryResult<DashboardView> {
  const analytics = useModuleClient(analyticsContract);

  return useQuery({
    queryKey: dashboardQueryKey(initial.id),
    queryFn: async () =>
      narrowDashboard(await analytics.readDashboard({ id: initial.id })),
    initialData: initial,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}

/** One panel, refetched every 10 seconds and when the window regains focus (R-50). */
export function usePanelData(
  dashboard: DashboardView,
  panelId: string,
  filters: DashboardFilterState
): UseQueryResult<ChartData> {
  const analytics = useModuleClient(analyticsContract);

  return useQuery({
    queryKey: panelQueryKey(
      dashboard.id,
      panelId,
      dashboard.version,
      filters.filters
    ),
    queryFn: async () => {
      // The stored filters apply without being sent; address filters apply to this read only.
      const answer = await analytics.panelData({
        id: dashboard.id,
        panelId,
        ...(filters.fromAddress && { filters: filters.filters }),
      });

      // SAFETY: `panelData` answers the chart gate's `ChartData` (R-15).
      return answer as ChartData;
    },
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    // A save moves the version, and the drawn chart stays until the new answer comes. Other
    // filters are another answer, so the panel shows loading rather than the old figure (S7-46).
    placeholderData: (previous, previousQuery) =>
      previousQuery !== undefined &&
      sameFilters(previousQuery.queryKey[5], filters.filters)
        ? previous
        : undefined,
    // A refusal is deterministic, and the 10-second refetch retries a transient one.
    retry: false,
  });
}

/**
 * Shows a saved dashboard. A refetch that started before the save is cancelled first, so its
 * older answer cannot land after the save and undo it on screen (czjw.42).
 */
async function showSaved(queryClient: QueryClient, view: DashboardView) {
  const queryKey = dashboardQueryKey(view.id);

  await queryClient.cancelQueries({ queryKey, exact: true });
  queryClient.setQueryData(queryKey, view);
}

/** One save on the dashboard, at the version the page read (B2.5). */
export function useDashboardChange(
  dashboard: DashboardView
): UseMutationResult<DashboardView, Error, readonly DashboardChange[]> {
  const analytics = useModuleClient(analyticsContract);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (changes: readonly DashboardChange[]) =>
      narrowDashboard(
        await analytics.changeDashboard({
          id: dashboard.id,
          expectedVersion: dashboard.version,
          changes: [...changes],
        })
      ),
    onSuccess: (view) => showSaved(queryClient, view),
  });
}

/** Undo the last save, at the version the page read (R-49). */
export function useUndoDashboard(
  dashboard: DashboardView
): UseMutationResult<DashboardView, Error, void> {
  const analytics = useModuleClient(analyticsContract);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () =>
      narrowDashboard(
        await analytics.undoDashboard({
          id: dashboard.id,
          expectedVersion: dashboard.version,
        })
      ),
    onSuccess: (view) => showSaved(queryClient, view),
  });
}
