/**
 * Deterministic English fixtures for the presentation stories.
 *
 * They exist so a story renders without a database, a network call, or a tenant.
 * They are not seed data and they never reach a runtime path.
 */
export type PlaceholderRecordView = {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
};

export const placeholderRecords: readonly PlaceholderRecordView[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    label: "First record",
    detail: "A fixture row. It proves layout, not persistence.",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    label: "Second record",
    detail: "A second fixture row, so the empty state differs from the list.",
  },
];
