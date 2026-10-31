import type { ModulePageProps } from "@genie/core";
import { PageHeader } from "@genie/core/features/shell";

import type { DeckListView, DeckPageView } from "./views.ts";

/**
 * The Slides list page. It asks no permission: core already asked with the page's
 * `permission` and renders its own denied response when the answer is no.
 */
export function DeckListPage(_props: ModulePageProps<DeckListView>) {
  return (
    <main>
      <PageHeader title="Slides" />
    </main>
  );
}

/** One deck page. The loader already answered missing for another person's deck. */
export function DeckPage(props: ModulePageProps<DeckPageView>) {
  return (
    <main>
      <PageHeader title={props.data.deck.title} />
    </main>
  );
}
