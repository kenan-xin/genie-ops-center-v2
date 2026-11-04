/** The space between two field cards of the pin column, in px (DK6). */
export const PIN_GAP = 8;

/** A field card: the middle of its source line, or null with no line, and its own height. */
export type PinInput = {
  readonly key: string;
  readonly lineY: number | null;
  readonly height: number;
};

/**
 * The top of each card in the pin column (prototype `placeAnnos`). The pinned cards go top to
 * bottom by line, each centred on its line unless the card above is in the way; the cards with no
 * line follow the last one, in input order. No card goes above the column.
 */
export function placePins(
  pins: readonly PinInput[],
  gap: number
): ReadonlyMap<string, number> {
  const pinned = pins
    .filter((candidate) => candidate.lineY !== null)
    .toSorted((a, b) => (a.lineY ?? 0) - (b.lineY ?? 0));

  const unpinned = pins.filter((candidate) => candidate.lineY === null);
  const tops = new Map<string, number>();
  let bottom = -Infinity;

  for (const pin of [...pinned, ...unpinned]) {
    const wanted =
      pin.lineY === null ? bottom + gap : pin.lineY - pin.height / 2;

    const top = Math.max(0, wanted, bottom + gap);

    tops.set(pin.key, top);
    bottom = top + pin.height;
  }

  return tops;
}

/**
 * The leader line from a dot on the page to its card: right 26 px from the dot, across to 14 px
 * before the card's middle, then into the card (prototype `placeAnnos`).
 */
export function leaderPath(input: {
  readonly dotX: number;
  readonly lineY: number;
  readonly cardX: number;
  readonly cardY: number;
}): string {
  return `M${input.dotX} ${input.lineY} H${input.dotX + 26} L${input.cardX - 14} ${input.cardY} H${input.cardX}`;
}
