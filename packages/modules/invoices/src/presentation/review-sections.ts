import type { ReviewItem } from "./review-model.ts";

export type ReviewSection = "needs" | "read" | "optional";

/** The captions of the one form, in their order on the page (czjw.187; G22 bans "needs you"). */
export const SECTION_TITLES = {
  needs: "Needs your input",
  read: "From the document",
  optional: "Optional",
} as const satisfies Record<ReviewSection, string>;

/** From the reading only, so a field never moves while the person types. */
export function sectionOf(
  item: Pick<ReviewItem, "sources" | "required">
): ReviewSection {
  if (item.sources.length > 0) return "read";

  return item.required ? "needs" : "optional";
}

/** The items of each section in list order; every item is in exactly one. */
export function sectionsOf(
  items: readonly ReviewItem[]
): Readonly<Record<ReviewSection, readonly ReviewItem[]>> {
  return {
    needs: items.filter((item) => sectionOf(item) === "needs"),
    read: items.filter((item) => sectionOf(item) === "read"),
    optional: items.filter((item) => sectionOf(item) === "optional"),
  };
}
