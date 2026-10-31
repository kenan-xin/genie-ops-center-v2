"use client";

import { PageHeader } from "@genie/core/features/shell";
import { EmptyState } from "@genie/ui";

import { FiltersBar } from "./filters-bar.tsx";
import { PanelCard } from "./panel-card.tsx";
import { useDashboard } from "./use-dashboard.ts";
import type { DashboardPageView } from "./views.ts";

export type DashboardViewProps = {
  readonly view: DashboardPageView;
};

/** One dashboard: its filters and its live panel grid (R-48 to R-50). */
export function DashboardView(props: DashboardViewProps) {
  const { view } = props;
  const dashboard = useDashboard(view.dashboard).data ?? view.dashboard;

  return (
    <main>
      <PageHeader title={dashboard.name} />
      {view.canWrite ? (
        <div className="mb-4">
          <FiltersBar dashboard={dashboard} />
        </div>
      ) : null}
      {dashboard.panels.length === 0 ? (
        <EmptyState
          variant="framed"
          title="No panels yet"
          description={
            view.chat.kind === "on"
              ? "Ask in the chat beside the dashboard to add a panel."
              : "This dashboard has no panels."
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-4">
          {dashboard.panels.map((panel) => (
            <PanelCard
              key={panel.id}
              dashboard={dashboard}
              panel={panel}
              timeZone={view.timeZone}
            />
          ))}
        </div>
      )}
    </main>
  );
}
