/**
 * The presentation types of the Modules screen. A browser-safe feature folder may not import the
 * server service, so these mirror `ModuleRow` of `services/modules/index.ts` and stay structurally
 * compatible with it.
 */

/** A principal that holds `<id>:use` through one role. One principal may appear once per role. */
export type ModuleHolderView = {
  readonly principalType: "user" | "group";
  readonly principalId: string;
  readonly label: string;
  readonly roleName: string;
};

export type ModuleView = {
  readonly id: string;
  readonly displayName: string;
  readonly enabled: boolean;
  /** Null when the module has no category, or one that no longer exists (R-91). */
  readonly categoryId: string | null;
  /** Whether the module declares a workspace entry, so a category can place it (R-84). */
  readonly placeable: boolean;
  readonly holders: readonly ModuleHolderView[];
};

export type CategoryOption = {
  readonly id: string;
  readonly name: string;
};

/** A refused switch: the server's safe message, and for an invalid configuration its issues. */
export type ModuleRefusal = {
  readonly moduleId: string;
  readonly message: string;
  readonly issues: readonly {
    readonly path: string;
    readonly message: string;
  }[];
};

export type ModulesScreenProps = {
  readonly modules: readonly ModuleView[];
  /** In display order. */
  readonly categories: readonly CategoryOption[];
  /** The id of the module whose change is saving. */
  readonly pending?: string | undefined;
  readonly refusal?: ModuleRefusal | undefined;
  readonly onSwitch: (moduleId: string, enabled: boolean) => void;
  readonly onCategory: (moduleId: string, categoryId: string | null) => void;
  readonly rolesHref: string;
  readonly settingsHref: string;
  /** The list is still being read: no table and no empty state yet. */
  readonly loading?: boolean | undefined;
  /** The list could not be read: this text replaces the table. */
  readonly error?: string | undefined;
};
