/**
 * The deck that a person describes with New deck on the Slides list (S7-48), and that the agent
 * names and drafts in one background turn. The recordings `synthetic-new-deck-1.json` to `-5.json`
 * are SYNTHETIC: each request was captured offline from the real request builder, and each
 * response was written by hand; no live model answered them. The owner records them live in R1.
 * They hold the description and the slide texts, so a change here re-keys them. The run reads the
 * deck, sends one change that renames it and adds the first slide, then one change per slide, and
 * answers. Answers 1, 3 and 4 stream for about 4.5 s and the others for about 1.5 s, so each
 * check that needs the draft in progress has a wide margin.
 */
export const DESCRIBED_DECK = {
  description:
    "A three-slide update on this month's collections for the finance team.",
  title: "Collections update for finance",
  slideTitles: [
    "Collections are the focus of this month's update.",
    "Overdue invoices need a follow-up.",
    "The finance team owns the next steps.",
  ],
} as const;
