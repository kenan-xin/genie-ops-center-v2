import type { SentencePart } from "./answer-sources.ts";

/**
 * An answer text's runs: two asterisks on each side mark the key figure or name (czjw.184). An
 * unmatched pair stays text, so an answer never loses a word to a lone mark.
 */
export function boldRuns(text: string): readonly SentencePart[] {
  const pieces = text.split("**");

  // An even count of pieces means the last pair of asterisks has no partner: it joins the text again.
  const paired =
    pieces.length % 2 === 0
      ? [...pieces.slice(0, -2), pieces.slice(-2).join("**")]
      : pieces;

  return paired.flatMap((piece, index) =>
    piece === "" ? [] : [{ text: piece, strong: index % 2 === 1 }]
  );
}
