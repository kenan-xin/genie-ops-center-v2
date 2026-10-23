/** Where a `?section=&field=` link lands (R-72, CF-CS-02). */
export type SettingsTarget = {
  readonly sectionId: string;
  readonly fieldId: string | null;
  /** The link named a section that does not exist or that the viewer may not open. */
  readonly stale: boolean;
};

/**
 * A section the viewer may not open is absent from `sectionIds`, so a forbidden link and a
 * retired one read the same: the first section, with the stale note. No hidden id is disclosed.
 */
export function resolveSettingsTarget(
  sectionIds: readonly string[],
  fieldIds: (sectionId: string) => readonly string[],
  query: {
    readonly section?: string | undefined;
    readonly field?: string | undefined;
  }
): SettingsTarget {
  const first = sectionIds[0] ?? "";

  if (query.section === undefined)
    return { sectionId: first, fieldId: null, stale: false };

  if (!sectionIds.includes(query.section))
    return { sectionId: first, fieldId: null, stale: true };

  const field = query.field;

  return {
    sectionId: query.section,
    fieldId:
      field !== undefined && fieldIds(query.section).includes(field)
        ? field
        : null,
    stale: false,
  };
}
