import { COLLECTIONS_PANEL } from "./analytics-chat.ts";

/**
 * The deck that the panel on the deck editor changes by chat, shared by the app integration test
 * and the dev e2e (Spec 7 R-46, R-53, D12, D21). The recorded model requests hold the deck id, its
 * content hash, the message and the page context, so a change here re-records
 * `slides-change-fix-1.json` to `-4.json`, `slides-change-1.json` to `-3.json` and
 * `slides-change-foreign-1.json` and `-2.json`. The keys are `SLIDES_CHAT_KEYS`.
 */

/** A fixed id, so the recorded requests match on every run (D12). */
export const SLIDES_CHANGE_DECK_ID = "7c1e4b2a-5d3f-4e6a-9b8c-0a0a0a0a0002";

export const SLIDES_CHANGE_DECK_TITLE = "Collections review";

/** The test reporting date, so a re-checked chart never meets `refresh-first`. */
export const SLIDES_CHANGE_FROZEN_ON = "2026-10-27";

export const SLIDES_CHANGE_OLD_TITLE =
  "Collections grew every month from July to October.";

export const SLIDES_CHANGE_NEW_TITLE = "Collections grew monthly.";

/**
 * The figure of slide `s2`: `COLLECTIONS_PANEL` with the data that `checkChart` answers for it on
 * the seeded demo history, taken once, with a fixed `readAt`, so the deck's hash is fixed.
 */
export const SLIDES_CHANGE_FIGURE = {
  kind: "figure",
  chart: COLLECTIONS_PANEL,
  data: {
    kind: "kpi",
    title: "Collections",
    datasets: ["invoices.payments"],
    columns: [
      {
        type: "money",
        currency: "SGD",
        key: "Collections",
        label: "Collections",
      },
    ],
    rows: [{ Collections: 19520000 }],
    readAt: "2026-10-27T02:00:00.000Z",
    truncated: false,
    sources: ["Payments"],
  },
} as const;

export const SLIDES_CHANGE_CONTENT = {
  slides: [
    {
      id: "s1",
      elements: [
        { kind: "title", text: "Collections are on track for October." },
        { kind: "text", text: "Every figure comes from the linked payments." },
      ],
    },
    {
      id: "s2",
      elements: [
        { kind: "title", text: SLIDES_CHANGE_OLD_TITLE },
        SLIDES_CHANGE_FIGURE,
      ],
    },
  ],
} as const;

/**
 * The typed-number decks of `czjw.166`: the demo pack's payments add up to SGD 195,200.00 by the
 * reporting date and to SGD 177,050.00 by 30 Sep 2026. The recorded requests hold these titles
 * and messages, so a change here re-records `synthetic-deck-figure-*.json`.
 */
export const SLIDES_TYPED_CONTENT = {
  slides: [
    SLIDES_CHANGE_CONTENT.slides[0],
    {
      id: "s2",
      elements: [
        {
          kind: "title",
          text: "Collections reached SGD 180,000.00 by October.",
        },
        SLIDES_CHANGE_FIGURE,
      ],
    },
  ],
} as const;

export const SLIDES_SAME_CONTENT = {
  slides: [
    SLIDES_CHANGE_CONTENT.slides[0],
    {
      id: "s2",
      elements: [
        {
          kind: "title",
          text: "Collections reached SGD 195,200.00 by October.",
        },
        SLIDES_CHANGE_FIGURE,
      ],
    },
  ],
} as const;

export const SLIDES_DATED_CONTENT = {
  slides: [
    SLIDES_CHANGE_CONTENT.slides[0],
    {
      id: "s2",
      elements: [
        {
          kind: "title",
          text: "Collections reached SGD 177,050.00 by September.",
        },
        {
          ...SLIDES_CHANGE_FIGURE,
          data: {
            ...SLIDES_CHANGE_FIGURE.data,
            rows: [{ Collections: 17705000 }],
            readAt: "2026-09-30T02:00:00.000Z",
          },
        },
      ],
    },
  ],
} as const;

export const SLIDES_DATED_FROZEN_ON = "2026-09-30";

export const SLIDES_FIGURE_READ_MESSAGE =
  "What collections total does the title of this slide give?";

export const SLIDES_FIGURE_SAME_MESSAGE =
  "Which collections total is in this slide's title?";

export const SLIDES_FIGURE_WRITE_MESSAGE =
  "Write the collections total into the title of this slide.";

export const SLIDES_FIGURE_DATED_MESSAGE =
  "How much does the title of this slide say we collected?";

export const SLIDES_CHANGE_MESSAGE = "Shorten the title of this slide.";

/** The page context of the deck editor on slide `s2`, as `deck-view.tsx` sends it. */
export const SLIDES_CHANGE_CONTEXT = {
  page: "Deck",
  record: { type: "slides-deck", id: SLIDES_CHANGE_DECK_ID },
  part: { type: "slide", id: "s2" },
} as const;

/** The page context of the deck editor on the title slide `s1`, where it opens. */
export const SLIDES_TITLE_SLIDE_CONTEXT = {
  ...SLIDES_CHANGE_CONTEXT,
  part: { type: "slide", id: "s1" },
} as const;

/**
 * The style change of S7-43 (AC-14), answered by `slides-style-1` to `-3`: a read, one
 * change with the background and a white text color for both texts of `s1` (each text without a
 * fill is re-checked against the background), and the answer.
 */
export const SLIDES_STYLE_MESSAGE =
  "Make the title slide dark blue with white text.";

export const SLIDES_STYLE_BACKGROUND = "#1E3A8A";

/**
 * The notes request of S7-45, answered by `slides-notes-1` to `-4`: a read, one
 * change-slide-fields step with the notes for `s2`, and a one-sentence answer.
 */
export const SLIDES_NOTES_MESSAGE =
  "Add speaker notes to slide 2: mention that the reminder emails started in September.";

export const SLIDES_NOTES_TEXT = "Reminder emails started in September.";

/** A request outside the deck tools, answered by `slides-out-of-tools-2` (R-46a). */
export const SLIDES_OUT_OF_TOOLS_MESSAGE = "Add a video to the title slide.";

export const SLIDES_OUT_OF_TOOLS_ANSWER =
  "I can’t add a video, but I can add an image to the title slide instead.";

/**
 * The message of the refused-and-fixed change. It differs from `SLIDES_CHANGE_MESSAGE`, so its
 * first request is not the first request of the plain change, and each replays its own answer.
 */
export const SLIDES_CHANGE_FIX_MESSAGE =
  "Add to the title of this slide that October passed the target for the year.";

export const SLIDES_CHANGE_FIX_TITLE =
  "Collections grew every month, and October passed the yearly target.";

/** What the model reads when its first change sends a slide title over 90 characters (czjw.79). */
export const FIELD_MESSAGE =
  "The request was not valid. changes.0.slide.elements.0.text: Too big: expected string to have <=90 characters";
