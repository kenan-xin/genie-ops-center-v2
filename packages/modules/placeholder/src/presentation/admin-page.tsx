import { PageHeader } from "@genie/core/features/shell";

export type AdminPageProps = {
  /** How many records the workspace holds, read by the page that renders this. */
  readonly recordCount: number;
};

/**
 * The module's one admin page. It is reached behind `placeholder:admin`, the key that enabling
 * the entitlement appends to `Tenant administrator` (DEC-23).
 */
export function AdminPage(props: AdminPageProps) {
  return (
    <main>
      <PageHeader title="Placeholder settings" />
      <p>This deployment holds {props.recordCount} placeholder records.</p>
    </main>
  );
}
