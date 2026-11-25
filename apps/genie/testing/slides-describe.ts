/**
 * The deck that a person describes with New deck on the Slides list (S7-48), and that the agent
 * names and drafts in one background turn. The recordings `new-deck-1.json` to `-7.json` were
 * recorded live (Phase 21). They hold the description and the slide texts, so a change here
 * re-keys them. The run reads the deck and the datasets, queries the records, renames the deck,
 * sends one change per slide, and answers. The read, the query and each slide change stream for
 * about 6 s, the rename for about 2 s and the answer for about 1.65 s, so each check that needs
 * the draft in progress has a wide margin.
 */
export const DESCRIBED_DECK = {
  description:
    "A three-slide update on this month's collections for the finance team.",
  title: "October Collections Update",
  slideTitles: [
    "October Collections Update",
    "October collections reached SGD 18,150.00.",
    "Apex Digital led October collections.",
  ],
} as const;
