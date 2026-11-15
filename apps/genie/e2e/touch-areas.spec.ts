import { expect, test } from "@playwright/test";

import { touchAreaFindings } from "./support/touch-areas.ts";

/**
 * One block per case. Every button is 40 px tall, at least 44 px wide and borderless, because an
 * `::after` inset counts from the padding box. `.touch` draws the shared 2 px touch area under the
 * button's content, the way the `touchAreas` token does. The cases sit in a focusable group, as
 * the shell's scroll region wraps every page, and a group is the controls' container, not a
 * control. A 16 px checkbox whose wrapping label fills its 44 px square sits outside the group.
 */
const FIXTURE = `<!doctype html>
<html>
  <head>
    <style>
      body { margin: 0; font: 16px sans-serif; }
      .block { padding: 24px; }
      button { height: 40px; padding: 0 16px; border: 0; background: #ddd; font: inherit; }
      .touch, .greedy, .small { position: relative; isolation: isolate; }
      .touch::after, .greedy::after, .small::after { content: ""; position: absolute; z-index: -10; }
      .touch::after { inset: -2px; }
      .greedy { z-index: 1; }
      .greedy::after { inset: -10px; }
      .small { width: 32px; height: 32px; padding: 0; }
      .small::after { inset: -6px; }
      .row { display: flex; gap: 4px; }
      .stack { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
      .group { display: flex; align-items: center; width: 240px; height: 40px; padding: 0 4px 0 8px; border: 1px solid #333; }
      .group input { flex: 1; min-width: 0; height: 100%; border: 0; padding: 0 8px; font: inherit; background: transparent; }
      .clip { display: flex; overflow: hidden; }
      .hidden { position: absolute; width: 1px; height: 1px; padding: 0; border: 0; overflow: hidden; clip: rect(0 0 0 0); }
      .off { height: 20px; }
      .agree { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 14px; }
      .box { width: 16px; height: 16px; background: #333; }
    </style>
  </head>
  <body>
    <div role="group" aria-label="Page" tabindex="0">
    <div class="block"><button>Bare</button></div>
    <div class="block"><button class="touch">Fits</button></div>
    <div class="block stack">
      <button class="touch">Upper</button>
      <button class="touch">Lower</button>
    </div>
    <div class="block row">
      <button class="greedy">Greedy</button>
      <button class="touch">Victim</button>
    </div>
    <div class="block row">
      <button class="small">Bold</button>
      <button class="small">Italic</button>
    </div>
    <div class="block">
      <div data-slot="input-group" class="group touch">
        <input aria-label="Amount" />
        <button class="small">Pick</button>
      </div>
    </div>
    <div class="block"><div class="clip"><button class="touch">Clipped</button></div></div>
    <div class="block">
      <p>
        Read the <a href="#terms">terms</a> before you pay.
        <input class="hidden" aria-label="Hidden" />
        <button class="off" disabled>Off</button>
      </p>
    </div>
    </div>
    <div class="block">
      <label class="agree">
        <span role="checkbox" aria-checked="false" aria-label="Agree" tabindex="0" class="box"></span>
        I agree
      </label>
    </div>
  </body>
</html>`;

// T6-a: the five findings prove the short, covering, too-close and clipped cases, and their
// absence proves the allowed ones (overlap in a gap, a nested field button, an inline link, a
// hidden input, a disabled button, a field's own wrapper, a wrapping label).
test("the touch area check finds short, covering and clipped areas and allows overlaps @no-screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(FIXTURE);

  expect((await touchAreaFindings(page)).toSorted()).toEqual([
    'button "Bare": touch area under 44 px (top, bottom)',
    'button "Bold": 44 px touch area runs into button "Italic"',
    'button "Clipped": touch area under 44 px (top, bottom)',
    'button "Greedy": covers button "Victim"',
    'button "Italic": covers button "Bold"',
  ]);
});

/**
 * A nested scroller, as the shell's content area is, taller inside than its 120 px box. And a 16 px
 * checkbox whose label also holds a 48 px link, 8 px to its right: inside its 44 px area.
 */
const SCROLLER_AND_LABEL_LINK = `<!doctype html>
<html>
  <head>
    <style>
      body { margin: 0; font: 16px sans-serif; }
      .scroller { height: 120px; overflow: auto; padding: 8px; }
      .scroller button { display: block; height: 44px; margin-bottom: 24px; padding: 0 16px; border: 0; background: #ddd; font: inherit; }
      .agree { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; margin: 24px; padding: 0 14px; }
      .box { width: 16px; height: 16px; background: #333; }
      .agree a { display: inline-block; width: 48px; }
    </style>
  </head>
  <body>
    <div class="scroller">
      <button>One</button>
      <button>Two</button>
      <button>Three</button>
      <button>Four</button>
    </div>
    <label class="agree">
      <span role="checkbox" aria-checked="false" aria-label="Agree" tabindex="0" class="box"></span>
      <a href="#terms">terms</a>
    </label>
  </body>
</html>`;

// T6-b: the check leaves a nested scroller where it found it, and a control inside a checkbox's
// label still runs into the checkbox's 44 px area.
test("the touch area check restores nested scrollers and counts a control inside a label @no-screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(SCROLLER_AND_LABEL_LINK);

  const findings = await touchAreaFindings(page);

  const scrollTop = await page
    .locator(".scroller")
    .evaluate((element) => element.scrollTop);

  expect({ findings, scrollTop }).toEqual({
    findings: ['checkbox "Agree": 44 px touch area runs into link "terms"'],
    scrollTop: 0,
  });
});
