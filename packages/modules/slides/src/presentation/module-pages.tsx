import type { ModulePageProps } from "@genie/core";

import { DeckList } from "./deck-list.tsx";
import { DeckView } from "./deck-view.tsx";
import type { DeckListView, DeckPageView } from "./views.ts";

/**
 * The Slides list page. It asks no permission: core already asked with the page's
 * `permission` and renders its own denied response when the answer is no.
 */
export function DeckListPage(props: ModulePageProps<DeckListView>) {
  return <DeckList view={props.data} />;
}

/** One deck page. The loader already answered missing for another person's deck. */
export function DeckPage(props: ModulePageProps<DeckPageView>) {
  return <DeckView view={props.data} />;
}
