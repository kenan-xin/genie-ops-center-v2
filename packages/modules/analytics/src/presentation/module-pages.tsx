import type { ModulePageProps } from "@genie/core";

import { DashboardList } from "./dashboard-list.tsx";
import { DashboardView } from "./dashboard-view.tsx";
import type { DashboardListView, DashboardPageView } from "./views.ts";

/**
 * The Dashboards list page. It asks no permission: core already asked with the page's
 * `permission` and renders its own denied response when the answer is no.
 */
export function DashboardListPage(props: ModulePageProps<DashboardListView>) {
  return <DashboardList view={props.data} />;
}

/** One dashboard page. The loader already answered missing for another person's dashboard. */
export function DashboardPage(props: ModulePageProps<DashboardPageView>) {
  return <DashboardView view={props.data} />;
}
