/**
 * The presentation types of the People screen. A browser-safe feature folder may not import the
 * design repository, so these mirror `docs/design/sections/people-groups-and-roles/types.ts` for
 * the people part, and are structurally compatible with the core service's read rows, so a host
 * maps one to the other without re-deriving a label. The one deliberate addition is a person's
 * `groups` as labelled pairs, because a pill needs the group's label and the design's `groupIds`
 * carries only ids.
 */

export type PersonStatus = "active" | "pending" | "disabled";

export type AccountType = "brokered" | "local";

/** One group pill of a person, with the label the screen renders (R-24c). */
export type PersonGroupChip = {
  readonly id: string;
  readonly label: string;
};

export type Person = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly status: PersonStatus;
  /** R-51a: fixed at creation and read from the account's own provider row. */
  readonly accountType: AccountType;
  /** Server-derived: the identity provider label, or "Genie (local password)". */
  readonly identitySource: string;
  readonly groups: readonly PersonGroupChip[];
  readonly roleCount: number;
  readonly firstSignInAt: string | null;
  readonly lastSignInAt: string | null;
  readonly onboarding: "invited" | "jit" | null;
  /** R-41: the latest `core:set_password_sent` audit time, for a pending local account. */
  readonly setPasswordSentAt: string | null;
  /** R-41: the latest `core:invitation_sent` audit time, for a pending brokered person. */
  readonly invitationSentAt: string | null;
};

/** One group a person belongs to, as the inspector's Groups tab reads it. */
export type PersonGroup = {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly source: "idp" | "local";
  readonly syncedAt: string | null;
};

/** One assignment a person holds, direct or through a group, as the Roles tab reads it. */
export type PersonAssignment = {
  readonly id: string;
  readonly roleId: string;
  readonly roleName: string;
  readonly moduleId: string | null;
  readonly scopeType: string | null;
  readonly scopeId: string | null;
  readonly source: "direct" | "group";
  readonly groupId: string | null;
  readonly groupName: string | null;
};

/** One session of a person, as the Sessions tab reads it. */
export type PersonSession = {
  readonly id: string;
  readonly device: string;
  readonly browser: string;
  readonly ipAddress: string;
  readonly signedInAt: string;
  readonly lastActiveAt: string;
};

/**
 * One person with their groups, assignments and sessions, as the inspector reads them. `groups`
 * is replaced with the full group rows (the summary's lighter chips are not needed here), so the
 * two `groups` shapes do not intersect.
 */
export type PersonDetail = Omit<Person, "groups"> & {
  readonly groups: readonly PersonGroup[];
  readonly assignments: readonly PersonAssignment[];
  readonly sessions: readonly PersonSession[];
};

/** One role Add person may assign now. */
export type AssignableRole = {
  readonly id: string;
  readonly name: string;
  readonly moduleId: string | null;
};

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
  /** Fires when a row opens or the inspector closes, so the host can load that person's detail. */
  readonly onSelectPerson?: (personId: string | null) => void;
  /**
   * Adds a person. The dialog stays open until this resolves; a rejection leaves it open and the
   * refusal shows in the alert (the host maps the tRPC error to its catalogue message).
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
