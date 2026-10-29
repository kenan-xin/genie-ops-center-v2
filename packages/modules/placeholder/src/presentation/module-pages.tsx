import type { ModulePageProps } from "@genie/core";
import type { ReactElement } from "react";

import { AdminPage } from "./admin-page.tsx";
import { EntryPage } from "./entry-page.tsx";
import { RecordPage } from "./record-page.tsx";
import { WorkspacePage } from "./workspace-page.tsx";

/**
 * The components the module's `pages` declarations render. Only the record page declares a loader
 * and reads its route props; the others render their empty state for now. The components
 * themselves stay in their own files, with their stories and their tests.
 */
export function PlaceholderWorkspacePage() {
  return <WorkspacePage records={[]} />;
}

/** The record page, fed by the `get` loader. */
export function PlaceholderRecordPage(
  props: ModulePageProps<{ readonly id: string; readonly label: string }>
) {
  return <RecordPage record={props.data} />;
}

export function PlaceholderAdminPage() {
  return <AdminPage recordCount={0} />;
}

/** The shared page of one further workspace entry, titled with the entry's label. */
export function placeholderEntryPage(label: string): () => ReactElement {
  return function PlaceholderEntryPage() {
    return <EntryPage label={label} />;
  };
}
