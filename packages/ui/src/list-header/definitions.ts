/*
 * A list header is plain data (LH14): no component and no function, so the client page and the
 * server loader import the same object. The address holds one parameter per filter id, the tab
 * parameter, and `sort`.
 */

export type ListOption = { readonly value: string; readonly label: string };

/** The built-in kinds. A page registers another kind through the `controls` of `ListHeader`. */
export type BuiltInFilterKind =
  | "search"
  | "option"
  | "multi-option"
  | "date-range";

export type ListFilterDefinition = {
  /** The address parameter. */
  readonly id: string;
  /** A built-in kind, or a kind that the page registers. */
  readonly kind: string;
  /** "Customer". */
  readonly label: string;
  /** The text with no value: "All customers". */
  readonly placeholder: string;
  readonly options?: readonly ListOption[];
  /** A closed list that the controls map to icons. */
  readonly icon?: "building" | "file";
};

export type ListTabDefinition = {
  readonly value: string;
  readonly label: string;
  readonly tone?: "danger" | "warning";
};

/** The status tabs on one status field. The first item is the resting tab. */
export type ListTabsDefinition = {
  readonly param: string;
  readonly items: readonly ListTabDefinition[];
};

/** Names the phone sort words: newest and oldest, highest and lowest, A to Z and Z to A. */
export type ListSortKind = "date" | "number" | "text";

export type ListSort = {
  readonly column: string;
  readonly direction: "asc" | "desc";
};

export type ListDefinition = {
  /** "Invoices": names the tabs and the table. */
  readonly label: string;
  /** ["invoice", "invoices"]. */
  readonly noun: readonly [one: string, many: string];
  readonly filters: readonly ListFilterDefinition[];
  readonly tabs?: ListTabsDefinition;
  /** The columns that sort, the only ones the address may name. */
  readonly sorts: readonly {
    readonly column: string;
    readonly kind: ListSortKind;
  }[];
  readonly defaultSort: ListSort;
};

/** The parameters of the address that the definition names, as written. */
export type ListParams = Readonly<Record<string, string>>;
