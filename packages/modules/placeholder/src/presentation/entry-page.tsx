import { PageHeader } from "@genie/core/features/shell";

export type EntryPageProps = {
  /** The navigation entry's label, which the page shows as its title. */
  readonly label: string;
};

/**
 * The one plain page behind the Archive and Retired entries. They exist so the navigation tests
 * see one entry per category case and an ordered pinned list (DEC-51), not as features.
 */
export function EntryPage(props: EntryPageProps) {
  return (
    <main>
      <PageHeader title={props.label} />
      <p>This placeholder entry holds nothing yet.</p>
    </main>
  );
}
