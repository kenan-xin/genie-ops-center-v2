import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useSyncExternalStore } from "react";
import { expect } from "storybook/test";

/**
 * The canary of the icon alignment check (6wz1.113). `MeasuredAtBothWidths` holds one aligned row,
 * and a second one only while a JavaScript media query matches a frame narrower than 1440 px, so
 * the check counts two icons at 390 and one at 1440 only when it measures after React re-rendered
 * for each width. `CheckIsOn` runs after it and fails when the setup file did not load or measured
 * the wrong layout.
 *
 * The breakpoint sits just under 1440, not at the 1024 px phone breakpoint, because the story's own
 * frame (1200 x 900, unpinned) must render the other layout than 1440 does: the check measures 1440
 * first, so a wait skipped after either resize then reads the previous layout and shows (P07-39).
 */
const meta = {
  title: "Testing/Icon alignment check",
  tags: ["!dev", "!autodocs"],
} satisfies Meta;

export default meta;

const NARROW = "(max-width: 1439px)";

const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(NARROW);

  query.addEventListener("change", onChange);

  return () => query.removeEventListener("change", onChange);
};

const isNarrow = () => window.matchMedia(NARROW).matches;

function AlignedRow({ children }: { children: string }) {
  return (
    <p style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
      <svg
        aria-hidden="true"
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <circle cx={12} cy={12} r={10} />
      </svg>
      {children}
    </p>
  );
}

function RowsByWidth() {
  const narrow = useSyncExternalStore(subscribe, isNarrow);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <AlignedRow>This row shows at every width.</AlignedRow>
      {narrow ? (
        <AlignedRow>This row shows only under 1440 px.</AlignedRow>
      ) : null}
    </div>
  );
}

export const MeasuredAtBothWidths: StoryObj<typeof meta> = {
  render: () => <RowsByWidth />,
};

export const CheckIsOn: StoryObj<typeof meta> = {
  render: () => <p>The check reads the canary above.</p>,
  play: () => {
    // oxlint-disable-next-line no-underscore-dangle -- the setup file's global, named so no story collides with it.
    const check = globalThis.__genieIconAlignment;

    expect(check, "the icon alignment setup file did not load").toBeDefined();

    if (check.enabled) {
      expect(
        check.measured.get(
          "testing-icon-alignment-check--measured-at-both-widths"
        )
      ).toEqual({ 390: 2, 1440: 1 });
      console.log("icon alignment check: on, 390 and 1440");
    } else {
      console.log("icon alignment check: off");
    }
  },
};
