import { extractText } from "unpdf";

/** One string per page, and whether any page holds a visible character (R-24, R-26). */
export type TextLayer = {
  readonly pages: readonly string[];
  readonly hasText: boolean;
};

/**
 * One string per page. Rejects when the bytes are not a readable PDF. Never detaches the
 * caller's buffer.
 */
export async function extractTextLayer(bytes: Uint8Array): Promise<TextLayer> {
  // The copy is on purpose: PDF.js can take ownership of the buffer it gets, and the reading
  // job sends the same bytes as the file part to a model that reads files.
  const { text } = await extractText(new Uint8Array(bytes), {
    mergePages: false,
  });

  return { pages: text, hasText: text.some((page) => /\S/.test(page)) };
}

/** Each page as "--- page <n> ---\n<text>", joined with "\n", n from 1. */
export function markedText(pages: readonly string[]): string {
  return pages
    .map((text, index) => `--- page ${index + 1} ---\n${text}`)
    .join("\n");
}
