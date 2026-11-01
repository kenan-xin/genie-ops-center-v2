/** A short-lived link to one image of a deck, and when it stops working (D6). */
export type ImageLink = { readonly url: string; readonly expiresAt: string };

export type ImageLinks = Readonly<Record<string, ImageLink>>;

/** A link this close to its expiry is replaced by the newest read's link. The deck polls every 10 s. */
const RENEW_BEFORE_MS = 60_000;

/**
 * The links the screen uses after a read. Each read answers new links, but a link with time left
 * stays, so a poll does not load every image again; a link about to expire is replaced, and an
 * image the read no longer shows drops out (I1).
 */
export function keepImageLinks(
  kept: ImageLinks,
  fresh: ImageLinks,
  now: number
): ImageLinks {
  return Object.fromEntries(
    Object.entries(fresh).map(([fileId, link]) => {
      const old = kept[fileId];

      return [
        fileId,
        old !== undefined && Date.parse(old.expiresAt) - now > RENEW_BEFORE_MS
          ? old
          : link,
      ];
    })
  );
}
