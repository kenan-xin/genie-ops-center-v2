import { PageHeader } from "@genie/core/features/shell";

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
