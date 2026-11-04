import { escape } from "es-toolkit";

import {
  normalizeForQuote,
  normalizeForQuoteWithSource,
} from "../services/reading/quote-check.ts";

export type TextItem = { readonly str: string; readonly hasEOL: boolean };

/** A marked range of one item; `highlight` is the index of its highlight in the tags. */
export type CharRange = readonly [
  start: number,
  end: number,
  highlight?: number,
];

/** How a highlight's marks are written: its key names them, and an untinted one shows no colour. */
export type MarkTag = { readonly key?: string; readonly tinted: boolean };

/** Where a page character came from: its text item, and its index in that item's `str`. */
type Source = { readonly item: number; readonly index: number };

/** The page as one string, with each character's item and index in that item. */
function pageText(items: readonly TextItem[]) {
  let text = "";
  const source: Source[] = [];

  items.forEach((item, itemIndex) => {
    for (let index = 0; index < item.str.length; index++) {
      text += item.str[index];
      source.push({ item: itemIndex, index });
    }

    if (item.hasEOL) {
      text += "\n";
      source.push({ item: itemIndex, index: item.str.length });
    }
  });

  return { text, source };
}

/** The first and last character a match covers inside one item. */
type Bounds = { readonly first: number; readonly last: number };

/**
 * The ranges of `quotes` in one page's text items (R-38). A quote is found over the joined text
 * after `normalizeForQuote`, so a quote across items or a line end still marks.
 */
export function quoteRanges(
  items: readonly TextItem[],
  quotes: readonly string[]
): ReadonlyMap<number, readonly CharRange[]> {
  const page = pageText(items);
  const normalized = normalizeForQuoteWithSource(page.text);
  const bounds = new Map<number, Bounds[]>();

  for (const quote of quotes) {
    const wanted = normalizeForQuote(quote);
    const at = wanted === "" ? -1 : normalized.text.indexOf(wanted);

    if (at === -1) continue;

    const perItem = new Map<number, Bounds>();

    for (let offset = at; offset < at + wanted.length; offset++) {
      const pageIndex = normalized.source[offset];

      const origin =
        pageIndex === undefined ? undefined : page.source[pageIndex];

      if (origin === undefined) continue;

      const current = perItem.get(origin.item);
      perItem.set(origin.item, {
        first:
          current === undefined
            ? origin.index
            : Math.min(current.first, origin.index),
        last:
          current === undefined
            ? origin.index
            : Math.max(current.last, origin.index),
      });
    }

    for (const [item, found] of perItem) {
      bounds.set(item, [...(bounds.get(item) ?? []), found]);
    }
  }

  return new Map(
    [...bounds].map(([item, list]) => [
      item,
      list.map(({ first, last }): CharRange => [first, last + 1]),
    ])
  );
}

/** The opening tag of a range's mark: plain, or with its highlight's key and untinted flag. */
function openMark(tag: MarkTag | undefined): string {
  if (tag === undefined) return "<mark>";

  const key =
    tag.key === undefined ? "" : ` data-highlight="${escape(tag.key)}"`;

  return `<mark${key}${tag.tinted ? "" : ' data-untinted=""'}>`;
}

/** One text item as HTML: every character escaped, each range inside one `<mark>`. */
export function markedHtml(
  str: string,
  ranges: readonly CharRange[],
  tags: readonly MarkTag[] = []
): string {
  const sorted = ranges.toSorted((a, b) => a[0] - b[0]);
  let html = "";
  let at = 0;

  for (const [start, end, highlight] of sorted) {
    const from = Math.max(at, Math.min(start, str.length));
    const to = Math.min(Math.max(end, from), str.length);

    html += escape(str.slice(at, from));
    at = from;

    if (to > from) {
      const tag = highlight === undefined ? undefined : tags[highlight];

      html += `${openMark(tag)}${escape(str.slice(from, to))}</mark>`;
      at = to;
    }
  }

  return html + escape(str.slice(at));
}
