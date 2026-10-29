/**
 * The client surface. A story, a component test and, later, the shell import from here, so
 * none of them pulls the router, the schema or their server dependencies into a browser.
 */

export { AdminPage, type AdminPageProps } from "./admin-page.tsx";

export { EntryPage, type EntryPageProps } from "./entry-page.tsx";

export { RecordPage, type RecordPageProps } from "./record-page.tsx";

export { TouchRecord } from "./touch-record.tsx";

export { WorkspacePage, type WorkspacePageProps } from "./workspace-page.tsx";

export type { PlaceholderRecordView } from "./__fixtures__/records.ts";
