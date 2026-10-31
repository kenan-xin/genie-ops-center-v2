"use client";

import type { PanelConfig } from "@genie/core";
import { useModuleClient } from "@genie/core/rpc/client";
import type { ChartData } from "@genie/ui";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import {
  analyticsContract,
  type DashboardChange,
  type PanelLayout,
} from "../contract.ts";
import type { DashboardView } from "./views.ts";

export const dashboardQueryKey = (id: string) =>
  ["analytics", "dashboard", id] as const;

export const panelQueryKey = (id: string, panelId: string, version: number) =>
  ["analytics", "panel", id, panelId, version] as const;

/** The server's answer before the browser narrows each panel config (Global Constraints). */
type SavedDashboard = Omit<DashboardView, "panels"> & {
  readonly panels: readonly {
    readonly id: string;
    readonly layout: PanelLayout;
    readonly config: unknown;
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
  panelId: string
): UseQueryResult<ChartData> {
  const analytics = useModuleClient(analyticsContract);

  return useQuery({
    queryKey: panelQueryKey(dashboard.id, panelId, dashboard.version),
    queryFn: async () => {
      const answer = await analytics.panelData({
        id: dashboard.id,
        panelId,
      });

      // SAFETY: `panelData` answers the chart gate's `ChartData` (R-15).
      return answer as ChartData;
    },
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    // A save moves the version in the key; the drawn chart stays until the new answer comes.
    placeholderData: keepPreviousData,
    // A refusal is deterministic, and the 10-second refetch retries a transient one.
    retry: false,
  });
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
    onSuccess: (view) => {
      queryClient.setQueryData(dashboardQueryKey(view.id), view);
    },
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
    onSuccess: (view) => {
      queryClient.setQueryData(dashboardQueryKey(view.id), view);
    },
  });
}
