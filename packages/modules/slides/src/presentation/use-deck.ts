"use client";

import { useModuleClient } from "@genie/core/rpc/client";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useCallback } from "react";

import { type DeckChange, slidesContract } from "../contract.ts";
import type { DeckView, ShownElement } from "./views.ts";

// Ruling F11: core owns the transport code, so the module re-exports rather than copying it.
export { appCodeOf } from "@genie/core/rpc/client";

/** The Slides list. */
export const decksQueryKey = () => ["slides", "decks"] as const;

/** One deck, read by its owner. */
export const deckQueryKey = (id: string) => ["slides", "deck", id] as const;

/** Every write on one deck, so a read can tell that one is still running. */
const deckWriteKey = (id: string) => ["slides", "deck-write", id] as const;

/** The server's answer before the browser narrows each stored element (Global Constraints). */
type SavedDeck = Omit<DeckView, "slides"> & {
  readonly slides: readonly {
    readonly id: string;
    readonly elements: readonly unknown[];
    readonly background?: string | undefined;
    readonly notes?: string | undefined;
  }[];
};

export function narrowDeck(view: SavedDeck): DeckView {
  return {
    ...view,
    slides: view.slides.map((slide) => ({
      id: slide.id,
      background: slide.background,
      notes: slide.notes,
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
  const queryClient = useQueryClient();
  const queryKey = deckQueryKey(initial.id);

  return useQuery({
    queryKey,
    // A read that overlapped a write may hold the deck from before it, so the write's answer stays.
    queryFn: async () => {
      const before = queryClient.getQueryState(queryKey)?.dataUpdatedAt;
      const read = narrowDeck(await slides.readDeck({ id: initial.id }));
      const state = queryClient.getQueryState<DeckView>(queryKey);

      const overlapped =
        state?.dataUpdatedAt !== before ||
        queryClient.isMutating({ mutationKey: deckWriteKey(initial.id) }) > 0;

      return overlapped ? (state?.data ?? read) : read;
    },
    initialData: initial,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}

/** One save on the deck, at the hash the person saw (R-53). */
export type DeckWrite = {
  readonly changes: readonly DeckChange[];
  /** The hash the person saw when the edit opened; never the newest read. */
  readonly expectedHash: string;
};

export function useDeckChange(
  deck: DeckView
): UseMutationResult<DeckView, Error, DeckWrite> {
  const slides = useModuleClient(slidesContract);
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: deckWriteKey(deck.id),
    // A poll that left before this save must not put its older deck over the save's answer.
    onMutate: () =>
      queryClient.cancelQueries({ queryKey: deckQueryKey(deck.id) }),
    mutationFn: async ({ changes, expectedHash }) =>
      narrowDeck(
        await slides.changeDeck({
          id: deck.id,
          expectedHash,
          changes: [...changes],
        })
      ),
    onSuccess: (view) => {
      queryClient.setQueryData(deckQueryKey(view.id), view);
    },
  });
}

/** Undo restores the newest save as stored, at the hash the page read (R-46, D1). */
export function useUndoDeck(
  deck: DeckView
): UseMutationResult<DeckView, Error, void> {
  const slides = useModuleClient(slidesContract);
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: deckWriteKey(deck.id),
    onMutate: () =>
      queryClient.cancelQueries({ queryKey: deckQueryKey(deck.id) }),
    mutationFn: async () =>
      narrowDeck(
        await slides.undoDeck({
          id: deck.id,
          expectedHash: deck.contentHash,
        })
      ),
    onSuccess: (view) => {
      queryClient.setQueryData(deckQueryKey(view.id), view);
    },
  });
}

/** Reads every figure again, at the hash the page read, and names the slides whose rows moved (D4). */
export function useRefreshDeck(
  deck: DeckView
): UseMutationResult<
  { readonly deck: DeckView; readonly changedSlides: readonly string[] },
  Error,
  void
> {
  const slides = useModuleClient(slidesContract);
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: deckWriteKey(deck.id),
    onMutate: () =>
      queryClient.cancelQueries({ queryKey: deckQueryKey(deck.id) }),
    mutationFn: async () => {
      const { deck: saved, changedSlides } = await slides.refreshDeck({
        id: deck.id,
        expectedHash: deck.contentHash,
      });

      return { deck: narrowDeck(saved), changedSlides };
    },
    onSuccess: ({ deck: view }) => {
      queryClient.setQueryData(deckQueryKey(view.id), view);
    },
  });
}

/** Writes the deck to PowerPoint on the server and answers its short-lived download link (D7). */
export function useExportDeck(
  deck: DeckView
): UseMutationResult<
  { readonly url: string; readonly fileName: string },
  Error,
  void
> {
  const slides = useModuleClient(slidesContract);

  return useMutation({
    mutationFn: () => slides.exportDeck({ id: deck.id }),
  });
}

/** One PNG or JPEG for the deck's image elements, answered as the file id a slide names (D6). */
export function useUploadDeckImage(
  deck: DeckView
): (file: File) => Promise<string> {
  const slides = useModuleClient(slidesContract);

  return useCallback(
    async (file: File) =>
      (await slides.uploadDeckImage({ id: deck.id, file })).fileId,
    [slides, deck.id]
  );
}
