import type { ModulePageProps } from "@genie/core";

import { DeckList } from "./deck-list.tsx";
import { DeckView } from "./deck-view.tsx";
import { PresenterView } from "./presenter-view.tsx";
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

/**
 * The presenter window of one deck (S7-45). Exit closes the pop-up; a page a script did not open
 * cannot close itself, so it goes back to the deck instead.
 */
export function PresenterPage(props: ModulePageProps<DeckPageView>) {
  const deckId = props.data.deck.id;

  return (
    <PresenterView
      view={props.data}
      onExit={() => {
        window.close();

        if (!window.closed) window.location.assign(`/m/slides/decks/${deckId}`);
      }}
    />
  );
}
