import type {
  AccountType,
  AssignableRole,
  PersonAssignmentRow as PersonAssignment,
  PersonDetail as PersonDetailRow,
  PersonGroupChipRow as PersonGroupChip,
  PersonGroupRow as PersonGroup,
  PersonRow as Person,
  PersonSessionRow as PersonSession,
  PersonStatus,
} from "../../services/people/index.ts";

/**
 * The presentation types of the People screen. The row views come from the people service through
 * a type-only import, which the browser-safety guard skips. `PersonDetail` drops the service's
 * `lastAdministrator`, because the screen reads `lastAdministratorPersonIds` instead. The settings,
 * viewer, Add person input and screen props are screen-only.
 */
export type {
  AccountType,
  AssignableRole,
  Person,
  PersonAssignment,
  PersonGroup,
  PersonGroupChip,
  PersonSession,
  PersonStatus,
};

/** One person with their groups, assignments and sessions, as the inspector reads them. */
export type PersonDetail = Omit<PersonDetailRow, "lastAdministrator">;

/** The tenant settings the Add person dialog reads (S2-10: onboarding mode, local accounts). */
export type PeopleSettings = {
  readonly onboardingMode: "invite" | "jit";
  readonly localAccountsEnabled: boolean;
};

export type PeopleViewer = {
  readonly id: string;
  readonly timeZone: string;
};

/** What Add person writes (R-40, R-40a). */
export type NewPersonInput = {
  readonly email: string;
  readonly name?: string | undefined;
  readonly roleIds: readonly string[];
  readonly accountType?: AccountType | undefined;
  /** Brokered accounts only; the checkbox is checked by default (R-40a). */
  readonly sendInvitation?: boolean | undefined;
};

export type PeopleScreenProps = {
  readonly people: readonly Person[];
  readonly viewer: PeopleViewer;
  readonly settings: PeopleSettings;
  /** The search field's label and placeholder, from the host catalogue (DEC-13). */
  readonly searchLabel: string;
  readonly roles: readonly AssignableRole[];
  /**
   * Whether the caller may pick roles in Add person. False hides the picker; the server refuses
   * roles in the input for a holder of `core:people:manage` alone (DEC-39). Defaults to true.
   */
  readonly canAssignRoles?: boolean | undefined;
  /** Per-person detail the host loads on selection, for the inspector. */
  readonly details?: Readonly<Record<string, PersonDetail>>;
  /** R-38: person ids where disable or remove would leave no active tenant administrator. */
  readonly lastAdministratorPersonIds: readonly string[];
  readonly error?: string | undefined;
  /**
   * A partial-success notice, e.g. the person was added but the email did not go out (N1). Shown
   * in a status region, not an error.
   */
  readonly notice?: string | undefined;
  readonly loading?: boolean | undefined;
  /** A write is running, so every button that writes shows the loading state (tokens.md "Buttons"). */
  readonly pending?: boolean | undefined;
  /** Fires when a row opens or the inspector closes, so the host can load that person's detail. */
  readonly onSelectPerson?: (personId: string | null) => void;
  /** A person to open on mount, for a link such as an audit target (`?selected=`). */
  readonly initialSelectedId?: string | undefined;
  /**
   * Adds a person. The dialog stays open until this resolves; a refusal rejects with the copy to
   * show as its `message`, and the dialog stays open with it (U-1).
   */
  readonly onAddPerson?: (input: NewPersonInput) => Promise<void> | void;
  readonly onDisablePerson?: (personId: string) => void;
  readonly onEnablePerson?: (personId: string) => void;
  readonly onRemovePerson?: (personId: string) => void;
  /** R-41: pending local-account people only. */
  readonly onResendSetPassword?: (personId: string) => void;
  /** R-41: pending brokered people only. */
  readonly onResendInvitation?: (personId: string) => void;
  /** Sign out one session of a person. */
  readonly onRevokeSession?: (personId: string, sessionId: string) => void;
  /** Sign out every session of a person. */
  readonly onRevokeAllSessions?: (personId: string) => void;
  /** Opens the Access screen with this person chosen (the one assignment writer, DEC-39). */
  readonly onManageAccess?: (personId: string) => void;
};
