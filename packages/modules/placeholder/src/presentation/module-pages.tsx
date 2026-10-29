import type { ReactElement } from "react";

import { AdminPage } from "./admin-page.tsx";
import { EntryPage } from "./entry-page.tsx";
import { WorkspacePage } from "./workspace-page.tsx";

/**
 * The components the module's `pages` declarations render. None declares a loader and none reads
 * its route props, so each renders its empty state for now. The components themselves stay in
 * their own files, with their stories and their tests.
 */
export function PlaceholderWorkspacePage() {
  return <WorkspacePage records={[]} />;
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
