/**
 * The browser-safe Groups feature: the directory, the inspector and their presentation types. It
 * imports no database, no registry and no environment value, so the Storybook host and the
 * application both render it without a running deployment.
 */
export { GroupInspector, GroupsScreen } from "./groups-screen.tsx";

export {
  groupLabel,
  type Group,
  type GroupAssignment,
  type GroupInspectorProps,
  type GroupMember,
  type GroupSource,
  type GroupsScreenProps,
  type GroupsViewer,
  type PersonOption,
} from "./types.ts";
