/**
 * The browser-safe Account page feature (R-18): the presentation types the page's three blocks
 * share. It imports no database, no registry, and no environment value, so the Storybook host
 * and the application render it without a running deployment.
 */

/** One group chip in the Profile block, with the source the chip's label names. */
export type AccountGroup = {
  readonly id: string;
  readonly name: string;
  readonly source: "idp" | "local";
};

/** One row of the Sessions block: the member's own-session read mapped for display. */
export type AccountSession = {
  readonly id: string;
  readonly device: string;
  readonly browser: string;
  readonly ipAddress: string;
  readonly signedInAt: string;
  readonly lastActiveAt: string;
  readonly isCurrent: boolean;
};

/**
 * One row of the read-only Roles and access block: the role, its permission count, the scope
 * label the server resolved (whole tenant, or the record's name), and the group it arrived
 * through - null for a direct assignment.
 */
export type AccountRoleGrant = {
  readonly roleName: string;
  readonly moduleName: string | null;
  readonly permissionCount: number;
  readonly scopeLabel: string;
  readonly via: string | null;
};

export type AccountPageProps = {
  readonly profile: {
    readonly name: string;
    readonly email: string;
  };
  readonly groups: readonly AccountGroup[];
  readonly sessions: readonly AccountSession[];
  readonly roleGrants: readonly AccountRoleGrant[];
  /**
   * The realm's own account page, which a local-account tenant links from Profile. Null for a
   * brokered tenant, which shows no link.
   */
  readonly accountManagementUrl: string | null;
  /** The time zone the timestamps format in, the tenant default until Section 3 adds a preference. */
  readonly timeZone: string;
  /** The clock the timestamps format against, injected so stories stay deterministic. */
  readonly nowIso: string;
  /** Sign out one non-current session, after the confirm dialog agrees. */
  readonly onRevokeSession?: (sessionId: string) => void;
  /** Sign out every other session, after the confirm dialog agrees. */
  readonly onRevokeOtherSessions?: () => void;
};
