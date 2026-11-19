/**
 * The top of a cell's first text: the first text node that is not blank and not inside an
 * `aria-hidden` mark (an avatar's initials), measured as its first line box, so a cell's padding
 * does not count (czjw.217).
 */
export function firstTextTop(cell: Element): number {
  const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);

  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.textContent?.trim() === "") continue;

    if (node.parentElement?.closest('[aria-hidden="true"]')) continue;

    const range = document.createRange();

    range.selectNodeContents(node);

    const top = range.getClientRects()[0]?.top;

    if (top !== undefined) return top;
  }

  throw new Error(`No text in the cell "${cell.textContent}"`);
}
