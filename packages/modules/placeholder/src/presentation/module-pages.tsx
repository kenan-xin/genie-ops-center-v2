import type { ComponentType } from "react";

import { AdminPage } from "./admin-page.tsx";
import { EntryPage } from "./entry-page.tsx";
import { WorkspacePage } from "./workspace-page.tsx";

/**
 * What the module registers under `pages`. Core mounts a page with no props, so each entry here
 * is the component the shell renders. Section 0 has no page loader: the read that fills these
 * from `ctx.tenant` arrives with the shell, so each entry renders its empty state for now. The
 * components themselves stay in their own files, with their stories and their tests.
 */
export function PlaceholderWorkspacePage() {
  return <WorkspacePage records={[]} />;
}

export function PlaceholderAdminPage() {
  return <AdminPage recordCount={0} />;
}

/** The shared page of one further workspace entry, titled with the entry's label. */
export function placeholderEntryPage(label: string): ComponentType {
  return function PlaceholderEntryPage() {
    return <EntryPage label={label} />;
  };
}
