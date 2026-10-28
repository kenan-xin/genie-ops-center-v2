import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, fn, userEvent } from "storybook/test";

import { ImageSlot } from "./image-slot.tsx";

/**
 * One branding image slot with no image yet: the drop zone (tokens.md, "Drop zone"). Each state
 * shows in light and dark, at the desktop and the phone viewport.
 */
const meta = {
  title: "Core/Branding/Image slot",
  component: ImageSlot,
  tags: ["autodocs"],
  args: {
    label: "Logo for light backgrounds",
    recommended: "SVG or PNG, at least 480 by 96 px, transparent background",
    image: undefined,
    state: {},
    onFile: fn(),
    onRemove: fn(),
  },
  globals: { viewport: { value: "desktop", isRotated: false } },
  decorators: [
    (Story) => (
      <div className="max-w-xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ImageSlot>;

export default meta;

type Story = StoryObj<typeof meta>;

const PHONE = { viewport: { value: "mobile1", isRotated: false } };

function zoneOf(canvasElement: HTMLElement): HTMLElement {
  const zone = canvasElement.querySelector<HTMLElement>("[data-drop-zone]");

  if (zone === null) throw new Error("the drop zone is missing");

  return zone;
}

/** The computed color of a token, as the browser writes a border or fill color. */
function tokenColor(host: HTMLElement, token: string): string {
  const probe = document.createElement("span");

  probe.style.color = `var(${token})`;
  host.append(probe);

  const color = getComputedStyle(probe).color;

  probe.remove();

  return color;
}

const readsAsADropTarget: Story["play"] = async ({ canvas, canvasElement }) => {
  const zone = zoneOf(canvasElement);
  const style = getComputedStyle(zone);

  await expect(style.borderTopWidth).toBe("2px");
  await expect(style.borderTopStyle).toBe("dashed");
  await expect(style.borderTopColor).toBe(tokenColor(zone, "--input"));
  await expect(style.backgroundColor).toBe(tokenColor(zone, "--muted"));
  await expect(zone.getBoundingClientRect().height).toBeGreaterThanOrEqual(120);
  await expect(canvas.getByText(/^Drop an image or/)).toBeVisible();
};

export const Idle: Story = { play: readsAsADropTarget };

export const IdleDark: Story = {
  globals: { theme: "dark" },
  play: readsAsADropTarget,
};

export const IdlePhone: Story = { globals: PHONE, play: readsAsADropTarget };

export const IdlePhoneDark: Story = {
  globals: { ...PHONE, theme: "dark" },
  play: readsAsADropTarget,
};

const focusShowsTheRing: Story["play"] = async ({ canvasElement }) => {
  const zone = zoneOf(canvasElement);

  await userEvent.tab();
  await expect(zone).toHaveFocus();
  await expect(getComputedStyle(zone).boxShadow).not.toBe("none");
};

export const Focus: Story = { play: focusShowsTheRing };

export const FocusDark: Story = {
  globals: { theme: "dark" },
  play: focusShowsTheRing,
};

const dragOverShowsTheDrop: Story["play"] = async ({
  canvas,
  canvasElement,
}) => {
  const zone = zoneOf(canvasElement);

  fireEvent.dragEnter(zone);
  fireEvent.dragOver(zone);
  await expect(canvas.getByText("Drop to upload")).toBeVisible();
  await expect(getComputedStyle(zone).borderTopStyle).toBe("solid");

  // Crossing the icon or the text fires dragleave on the zone; the state stays.
  const child = zone.querySelector("svg");

  fireEvent.dragLeave(zone, { relatedTarget: child });
  await expect(canvas.getByText("Drop to upload")).toBeVisible();

  fireEvent.dragLeave(zone, { relatedTarget: null });
  await expect(canvas.getByText(/^Drop an image or/)).toBeVisible();

  // End in the drag-over state, so the capture shows it.
  fireEvent.dragEnter(zone);
};

export const DragOver: Story = { play: dragOverShowsTheDrop };

export const DragOverDark: Story = {
  globals: { theme: "dark" },
  play: dragOverShowsTheDrop,
};

export const DragOverPhone: Story = {
  globals: PHONE,
  play: dragOverShowsTheDrop,
};

export const Uploading: Story = { args: { state: { uploading: "logo.png" } } };

export const UploadingDark: Story = {
  args: { state: { uploading: "logo.png" } },
  globals: { theme: "dark" },
};

const refusedShowsOnTheZone: Story["play"] = async ({
  canvas,
  canvasElement,
}) => {
  const zone = zoneOf(canvasElement);

  await expect(zone).toHaveAccessibleDescription(
    "The file is larger than 1 MB."
  );
  await expect(canvas.getByText("The file is larger than 1 MB.")).toBeVisible();
  await expect(getComputedStyle(zone).borderTopColor).toBe(
    tokenColor(
      zone,
      document.documentElement.dataset.theme === "dark"
        ? "--destructive-on-dark"
        : "--destructive"
    )
  );
};

const REFUSED = { state: { error: "The file is larger than 1 MB." } };

export const Refused: Story = { args: REFUSED, play: refusedShowsOnTheZone };

export const RefusedDark: Story = {
  args: REFUSED,
  globals: { theme: "dark" },
  play: refusedShowsOnTheZone,
};

export const RefusedPhone: Story = {
  args: REFUSED,
  globals: PHONE,
  play: refusedShowsOnTheZone,
};
