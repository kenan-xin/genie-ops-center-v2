/**
 * The browser-safe People feature: the directory, the inspector and the Add person dialog. It
 * imports no database, no registry and no environment value, so the Storybook host and the
 * application both render it without a running deployment.
 */
export {
  AddPersonDialog,
  LAST_ADMIN_REASON,
  PeopleScreen,
  PersonInspector,
  SELF_REASON,
} from "./people-screen.tsx";

export type {
  AccountType,
  AssignableRole,
  NewPersonInput,
  PeopleScreenProps,
  PeopleSettings,
  PeopleViewer,
  Person,
  PersonAssignment,
  PersonDetail,
  PersonGroup,
  PersonGroupChip,
  PersonSession,
  PersonStatus,
} from "./types.ts";
