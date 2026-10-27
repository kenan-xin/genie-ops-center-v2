import type {
  ModuleHolder as ModuleHolderView,
  ModuleRow as ModuleView,
} from "../../services/modules/index.ts";

/**
 * The presentation types of the Modules screen. The row views come from the modules service through
 * a type-only import, which the browser-safety guard skips. The category option, the refusal, the
 * Access labels and the screen props are screen-only, because the host builds them for this screen.
 */
export type { ModuleHolderView, ModuleView };

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

/** The Access cell strings and the switch spinner name, from the host's message catalogue (DR-26). */
export type AccessLabels = {
  /** The visible count of holders the cell does not name, for example "+12". */
  readonly more: (count: number) => string;
  /** The accessible name of that count; it starts with the visible text. */
  readonly showAll: (count: number, moduleName: string) => string;
  /** The title of the full list, and the name of the list in the cell. */
  readonly title: (moduleName: string) => string;
  readonly group: (groupName: string) => string;
  /** The name of the spinner beside an enable switch while its call runs. */
  readonly saving: (moduleName: string) => string;
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
  readonly accessLabels: AccessLabels;
  /** The list is still being read: no table and no empty state yet. */
  readonly loading?: boolean | undefined;
  /** The list could not be read: this text replaces the table. */
  readonly error?: string | undefined;
};
