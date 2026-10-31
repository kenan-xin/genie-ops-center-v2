import { PageHeader } from "@genie/core/features/shell";

/**
 * The Slides list page. It asks no permission: core already asked with the page's
 * `permission` and renders its own denied response when the answer is no.
 */
export function DeckListPage() {
  return (
    <main>
      <PageHeader title="Slides" />
    </main>
  );
}
