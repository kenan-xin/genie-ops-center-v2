export { AccessTabs } from "./access-tabs.tsx";

export {
  type AccessLink,
  accessHref,
  accessOverviewHref,
} from "./access-link.ts";

export { linkedSubject } from "./overview-view.ts";

export { recipientDetail } from "./assignment-words.ts";

export {
  RecipientField,
  type RecipientFieldProps,
} from "./recipient-field.tsx";

export { RecipientMark } from "./recipient-mark.tsx";

export {
  AddAssignmentForm,
  type AddAssignmentFormProps,
  type AddAssignmentInput,
} from "./add-assignment-form.tsx";

export {
  addedMessage,
  namesOf,
  type RoleChoice,
  type RoleChoiceGroup,
  roleChoices,
} from "./add-assignment-view.ts";

export { RoleField } from "./role-field.tsx";

export {
  AssignmentsTable,
  type AssignmentsTableProps,
  type InspectorAccess,
} from "./assignments-table.tsx";

/**
 * The browser-safe Access feature: the Grants and Overview screens and their parts. It imports no database, no
 * registry and no environment value, so the Storybook host and the application both render it
 * without a running deployment.
 */
export { GrantsScreen, type GrantsScreenProps } from "./grants-screen.tsx";

export { scopeKey } from "./advanced-view.ts";

export {
  type OverviewPage,
  OverviewScreen,
  type OverviewScreenProps,
} from "./overview-screen.tsx";
