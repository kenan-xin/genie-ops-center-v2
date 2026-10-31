"use client";

import { useModuleClient } from "@genie/core/rpc/client";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { type DeckChange, slidesContract } from "../contract.ts";
import type { DeckView, ShownElement } from "./views.ts";

// Ruling F11: core owns the transport code, so the module re-exports rather than copying it.
export { appCodeOf } from "@genie/core/rpc/client";

/** The Slides list. */
export const decksQueryKey = () => ["slides", "decks"] as const;

/** One deck, read by its owner. */
export const deckQueryKey = (id: string) => ["slides", "deck", id] as const;

/** The server's answer before the browser narrows each stored element (Global Constraints). */
type SavedDeck = Omit<DeckView, "slides"> & {
  readonly slides: readonly {
    readonly id: string;
    readonly elements: readonly unknown[];
  }[];
};

function narrowDeck(view: SavedDeck): DeckView {
  return {
    ...view,
    slides: view.slides.map((slide) => ({
      id: slide.id,
      elements: slide.elements.map(
        // SAFETY: the server parsed the stored content with `deckContentSchema`, and `deckViewFor`
        // only adds `hidden` to a data element it could no longer read (D15).
        (element) => element as ShownElement
      ),
    })),
  };
}

/**
 * One deck as the page reads it, starting from the loader's answer. It asks again every 10 seconds
 * and on focus, so a change from another tab shows (as the analytics twin does).
 */
export function useDeck(initial: DeckView): UseQueryResult<DeckView> {
  const slides = useModuleClient(slidesContract);

  return useQuery({
    queryKey: deckQueryKey(initial.id),
    queryFn: async () => narrowDeck(await slides.readDeck({ id: initial.id })),
    initialData: initial,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}

/** One save on the deck, at the hash the page read (R-53). */
export function useDeckChange(
  deck: DeckView
): UseMutationResult<DeckView, Error, readonly DeckChange[]> {
  const slides = useModuleClient(slidesContract);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (changes: readonly DeckChange[]) =>
      narrowDeck(
        await slides.changeDeck({
          id: deck.id,
          expectedHash: deck.contentHash,
          changes: [...changes],
        })
      ),
    onSuccess: (view) => {
      queryClient.setQueryData(deckQueryKey(view.id), view);
    },
  });
}
