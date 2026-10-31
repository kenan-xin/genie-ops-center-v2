import type { ModulePageProps } from "@genie/core";
import { PageHeader } from "@genie/core/features/shell";

import type { DashboardPageView } from "./views.ts";

/**
 * The Dashboards list page. It asks no permission: core already asked with the page's
 * `permission` and renders its own denied response when the answer is no.
 */
export function DashboardListPage() {
  return (
    <main>
      <PageHeader title="Dashboards" />
    </main>
  );
}

/** One dashboard page. The loader already answered missing for another person's dashboard. */
export function DashboardPage({ data }: ModulePageProps<DashboardPageView>) {
  return (
    <main>
      <PageHeader title={data.dashboard.name} />
    </main>
  );
}
