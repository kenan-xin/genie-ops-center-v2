import {
  ICON_ALIGNMENT_ALLOW_LIST,
  iconAlignmentProblems,
  measureIconAlignment,
} from "@genie/ui/testing/icon-alignment";
import { afterEach, inject } from "vitest";
import { page } from "vitest/browser";

import { KNOWN_CASE_STORIES } from "./known-case-stories.ts";

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

/** The icons of the known cases (P07-71): a known-case story ignores the allow list for these only. */
const KNOWN_CASE_ICON =
  /lucide-sparkles|lucide-check\b|lucide-circle-check|lucide-circle-alert|lucide-loader-circle|box \d+x\d+|lucide-info|lucide-circle-question-mark/;

/** The icon of a problem line: `<rule> <offset> px <cause>: <icon> in "<row>" ...`. */
const iconOf = (problem: string) =>
  /^\S+ \S+ px \S+: (.+?) in "/.exec(problem)?.[1] ?? "";

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
  known: boolean
): Promise<{ units: number; lines: string[] }> {
  await page.viewport(width, height);
  await twoFrames();

  const { units, relations } = measureIconAlignment(ICON_ALIGNMENT_ALLOW_LIST);
  const problems = iconAlignmentProblems(relations);

  if (known) {
    // P07-71: the allow list covers the story's other icons, so a second run without it keeps
    // only the known-case icons' lines.
    const allowed = new Set(problems);

    const knownOnly = iconAlignmentProblems(
      measureIconAlignment([]).relations
    ).filter(
      (problem) =>
        !allowed.has(problem) && KNOWN_CASE_ICON.test(iconOf(problem))
    );

    problems.push(...knownOnly);
  }

  return {
    units,
    lines: problems
      .toSorted()
      .map((problem) => `${width}x${height} ${problem}`),
  };
}

afterEach(async ({ task }) => {
  // A story that already failed needs no icon lines on top.
  if (!enabled || task.result?.state === "fail") return;

  const storyId = task.meta.storyId;

  if (storyId === undefined) return;

  const own = [innerWidth, innerHeight] as const;

  const known = KNOWN_CASE_STORIES.includes(storyId);

  let lines: string[];

  try {
    // One width after the other, desktop first. The canary's own frame renders the other layout
    // than 1440, and 1440 the other layout than 390, so a wait skipped after either resize reads
    // the previous layout and fails the canary (P07-39).
    const desktop = await measureAt(DESKTOP, known);
    const phone = await measureAt(PHONE, known);

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
