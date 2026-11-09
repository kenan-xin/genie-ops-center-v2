export type DeckSyncMessage =
  | {
      readonly kind: "show";
      readonly index: number;
      readonly from: "audience" | "presenter";
    }
  | { readonly kind: "ask" }
  | { readonly kind: "closed" };

export type DeckSync = {
  readonly post: (message: DeckSyncMessage) => void;
  readonly close: () => void;
};

/**
 * One window's end of the per-deck channel `slides-present:<deckId>`. A channel never delivers a
 * post to its own end, so a window that follows a received show never hears itself.
 */
export function openDeckSync(
  deckId: string,
  onMessage: (message: DeckSyncMessage) => void
): DeckSync {
  const channel = new BroadcastChannel(`slides-present:${deckId}`);

  // SAFETY: only these two windows of one origin post on a channel of this name.
  channel.addEventListener("message", (event: MessageEvent) =>
    onMessage(event.data as DeckSyncMessage)
  );

  return {
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a BroadcastChannel stays within its origin and takes no target
    post: (message) => channel.postMessage(message),
    close: () => channel.close(),
  };
}

/** The deck's page. */
export function deckPath(deckId: string): string {
  return `/m/slides/decks/${deckId}`;
}

/** The presenter window's page. */
export function presenterPath(deckId: string): string {
  return `${deckPath(deckId)}/presenter`;
}

/** The presenter timer: `m:ss`, and `h:mm:ss` from one hour. */
export function formatElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const ss = String(seconds % 60).padStart(2, "0");

  return hours === 0
    ? `${minutes}:${ss}`
    : `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
}
