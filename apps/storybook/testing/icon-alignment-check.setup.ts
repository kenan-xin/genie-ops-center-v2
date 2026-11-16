import {
  ICON_ALIGNMENT_ALLOW_LIST,
  iconAlignmentProblems,
  measureIconAlignment,
} from "@genie/ui/testing/icon-alignment";
import { afterEach, inject } from "vitest";
import { page } from "vitest/browser";

/**
 * The icon alignment check of every story test (6wz1.113, P07-3). After the story's play, its own
 * hooks and axe, it measures the still-mounted story at 390 x 844 and 1440 x 900, puts the story's
 * own size back, and fails the test with one line per icon more than 1 px out of line.
 * `GENIE_ICON_ALIGNMENT=off` turns it off (P07-6); `vitest.config.ts` provides the switch.
 */

declare module "vitest" {
  interface ProvidedContext {
    iconAlignment: boolean;
  }

  interface TaskMeta {
    /** Set by `@storybook/addon-vitest` before the story runs. */
    storyId?: string;
  }
}

type IconAlignmentState = {
  readonly enabled: boolean;
  /** Story id to the number of icon units measured at each width. */
  readonly measured: Map<string, Record<number, number>>;
};

declare global {
  // oxlint-disable-next-line no-underscore-dangle, no-var -- a page global that the canary story reads; `declare global` needs `var`.
  var __genieIconAlignment: IconAlignmentState;
}

/**
 * Stories that ignore the allow list, so no entry can hide one of the known misalignments that
 * this phase fixes (P07-16): every story whose first red run (Task 4) showed a known case.
 */
export const KNOWN_CASE_STORIES: readonly string[] = [
  // D1 and E1: the step timeline fold and its icon column.
  "core-agent-agent-panel-host--surface-artifact-read-fails",
  "core-agent-agent-panel-host--surface-artifact-sheet",
  "core-agent-agent-panel-host--surface-artifact-sheet-on-a-phone",
  "core-agent-ask-screen--an-artifact-opens-only-when-asked",
  "core-agent-conversation--artifact-cards-in-ask",
  "core-agent-conversation--artifact-cards-in-the-panel",
  "core-agent-conversation--one-edge-on-a-desktop",
  "core-agent-conversation--one-edge-on-a-phone",
  "core-agent-message-parts--answer-before-a-tool-call",
  "core-agent-message-parts--empty-and-refused-reads",
  "core-agent-message-parts--file-being-made",
  "core-agent-message-parts--file-not-made",
  "core-agent-message-parts--file-ready",
  "core-agent-message-parts--how-this-was-counted",
  "core-agent-message-parts--result-first",
  "core-agent-message-parts--step-note-before-a-tool",
  "core-agent-steptimeline--done",
  "core-agent-steptimeline--done-in-ask",
  "core-agent-steptimeline--done-in-one-second",
  "core-agent-steptimeline--failed",
  "core-agent-steptimeline--failed-in-ask",
  "core-agent-steptimeline--file-still-making",
  "core-agent-steptimeline--fixed",
  "core-agent-steptimeline--fixed-in-ask",
  "core-agent-steptimeline--working",
  // The stopped answer.
  "core-agent-conversation--stop-keeps-the-answer",
  "core-agent-message-parts--stopped-after-a-step-note",
  "core-agent-message-parts--stopped-answer",
  // E5: the recolor note.
  "modules-slides-deck--recolor-note",
  // C3: the help disclosure trigger.
  "core-break-glass-sign-in--enrollment",
  "core-break-glass-sign-in--enrollment-dark",
  "core-break-glass-sign-in--enrollment-needs-password",
  "core-break-glass-sign-in--forced-change-dark",
  "core-break-glass-sign-in--forced-change-meter",
  "core-break-glass-sign-in--forced-change-why-am-i-here",
  "core-break-glass-sign-in--rate-limited-change-password",
  "core-break-glass-sign-in--rate-limited-enrollment",
  "core-groups--access-card-is-never-a-dead-end",
  "core-groups--access-card-without-the-key",
  "core-groups--adds-a-person-in-one-step",
  "core-groups--archive-confirm-names-the-assignment-count",
  "core-groups--archive-confirm-uses-the-singular-for-one",
  "core-groups--archived-group-offers-no-open-in-access",
  "core-groups--dark",
  "core-groups--delete-is-an-outline-with-red-text",
  "core-groups--empty-local-group-delete-confirm-counts-nothing",
  "core-groups--inspector-phone",
  "core-groups--inspector-phone-dark",
  "core-groups--label-shows-and-value-stays-in-the-inspector",
  "core-groups--last-administrator-blocks-archive-with-the-reason",
  "core-groups--local-group-delete-confirm-names-both-counts",
  "core-groups--local-header-names-the-kind-once",
  "core-groups--members-intro-names-the-identity-provider",
  "core-groups--not-seen-group-offers-delete-not-archive",
  "core-groups--opens-the-linked-group",
  "core-groups--phone",
  "core-groups--remove-all-stays-visible-when-everyone-is-a-member",
  "core-groups--removes-one-member-from-the-group",
  "core-groups--stale-group-warns",
  "core-groups--unlabelled-group-asks-for-a-label-in-the-inspector",
  "ui-helpdisclosure--default",
  "ui-helpdisclosure--in-a-flex-column",
  "ui-helpdisclosure--in-a-grid-column",
  "ui-helpdisclosure--inside-a-sheet",
  "ui-helpdisclosure--phone",
];

const PHONE = [390, 844] as const;

const DESKTOP = [1440, 900] as const;

const enabled = inject("iconAlignment");

// oxlint-disable-next-line no-underscore-dangle -- see the declaration above.
globalThis.__genieIconAlignment = { enabled, measured: new Map() };

/** Two frames: React commits what a resize changed (a media query listener) before the next paint. */
const twoFrames = () =>
  new Promise<void>((settle) => {
    requestAnimationFrame(() => requestAnimationFrame(() => settle()));
  });

/** Resizes the story frame, waits for React, and gives the unit count and one line per problem. */
async function measureAt(
  [width, height]: readonly [number, number],
  allow: typeof ICON_ALIGNMENT_ALLOW_LIST
): Promise<{ units: number; lines: string[] }> {
  await page.viewport(width, height);
  await twoFrames();

  const { units, relations } = measureIconAlignment(allow);

  return {
    units,
    lines: iconAlignmentProblems(relations).map(
      (problem) => `${width}x${height} ${problem}`
    ),
  };
}

afterEach(async ({ task }) => {
  // A story that already failed needs no icon lines on top.
  if (!enabled || task.result?.state === "fail") return;

  const storyId = task.meta.storyId;

  if (storyId === undefined) return;

  const own = [innerWidth, innerHeight] as const;

  const allow = KNOWN_CASE_STORIES.includes(storyId)
    ? []
    : ICON_ALIGNMENT_ALLOW_LIST;

  let lines: string[];

  try {
    // One width after the other, desktop first. The canary's own frame renders the other layout
    // than 1440, and 1440 the other layout than 390, so a wait skipped after either resize reads
    // the previous layout and fails the canary (P07-39).
    const desktop = await measureAt(DESKTOP, allow);
    const phone = await measureAt(PHONE, allow);

    // oxlint-disable-next-line no-underscore-dangle -- see the declaration above.
    globalThis.__genieIconAlignment.measured.set(storyId, {
      [PHONE[0]]: phone.units,
      [DESKTOP[0]]: desktop.units,
    });
    lines = [...phone.lines, ...desktop.lines];
  } finally {
    // Also after a throw: without it, the next story's play runs at a measuring size, and two
    // select stories failed (P07-4).
    await page.viewport(...own);
    await twoFrames();
  }

  if (lines.length > 0) {
    throw new Error(
      `Icons out of line in ${storyId} (6wz1.113):\n${lines.join("\n")}`
    );
  }
});
