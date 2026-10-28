import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";

import { DEFAULT_MARK_URL, IdentityBlock } from "./identity-block.tsx";

// A 1x1 transparent PNG: loads without a network request.
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const svg = (body: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 20'>${body}</svg>`)}`;

const LIGHT_LOGO = svg("<rect width='100' height='20' fill='#1d4ed8'/>");

const DARK_LOGO = svg("<rect width='100' height='20' fill='#f8fafc'/>");

const NO_IMAGES = { logoLightUrl: null, logoDarkUrl: null, markUrl: null };

const LOGOS = { logoLightUrl: LIGHT_LOGO, logoDarkUrl: DARK_LOGO };

/** The one image a reader sees in the block: the other theme's row is `display: none`. */
function shownImage(root: HTMLElement): HTMLImageElement | undefined {
  const shown = [...root.querySelectorAll("img")].filter((image) =>
    image.checkVisibility()
  );

  return shown.length === 1 ? shown[0] : undefined;
}

/** The other theme's row holds the same names, hidden; exactly one copy shows. */
const shownText = (root: HTMLElement, text: string) =>
  expect(
    within(root)
      .getAllByText(text)
      .filter((node) => node.checkVisibility())
  ).toHaveLength(1);

const showsImage = (root: HTMLElement, src: string) =>
  waitFor(() => expect(shownImage(root)?.getAttribute("src")).toBe(src));

/**
 * The shell's identity block (R-39, DR-03): in light theme the published light logo, in dark theme
 * the dark logo, each above the product name or the Admin portal pill. Without a logo for the
 * theme, or when it fails to load, the square mark beside the company and product names; without
 * a mark, the Ops Center icon.
 */
const meta = {
  title: "Core/Shell/Identity block",
  component: IdentityBlock,
  tags: ["autodocs"],
  args: {
    chrome: "workspace",
    identity: {
      companyName: "Acme Health",
      productName: "Genie Ops Center",
      ...NO_IMAGES,
    },
    adminPortalLabel: "Admin portal",
  },
  decorators: [
    (Story) => (
      <div className="w-60 rounded-xl border border-border bg-muted">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof IdentityBlock>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NoBranding: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("Acme Health")).toBeVisible();
    await expect(canvas.getByText("Genie Ops Center")).toBeVisible();
    await showsImage(canvasElement, DEFAULT_MARK_URL);
    // The static default is served (Storybook staticDirs, the app's public folder).
    await waitFor(() =>
      expect(shownImage(canvasElement)?.naturalWidth).toBeGreaterThan(0)
    );
    await expect(shownImage(canvasElement)).toHaveAttribute("alt", "");
  },
};

export const NoBrandingDark: Story = {
  globals: { theme: "dark" },
  play: async ({ canvasElement }) => {
    await showsImage(canvasElement, DEFAULT_MARK_URL);
  },
};

export const PublishedLogos: Story = {
  args: {
    identity: { ...meta.args.identity, ...LOGOS, markUrl: PIXEL },
  },
  play: async ({ canvas, canvasElement }) => {
    await showsImage(canvasElement, LIGHT_LOGO);
    // The logo carries the company name; the product name stays below it.
    await expect(canvas.getByRole("img", { name: "Acme Health" })).toBe(
      shownImage(canvasElement)
    );
    shownText(canvasElement, "Genie Ops Center");
  },
};

export const PublishedLogosDark: Story = {
  ...PublishedLogos,
  globals: { theme: "dark" },
  play: async ({ canvasElement }) => {
    await showsImage(canvasElement, DARK_LOGO);
  },
};

// Only the light logo: dark theme does not borrow it (a dark-ink logo vanishes on a dark panel).
export const LightLogoOnlyDark: Story = {
  args: {
    identity: {
      ...meta.args.identity,
      logoLightUrl: LIGHT_LOGO,
      markUrl: PIXEL,
    },
  },
  globals: { theme: "dark" },
  play: async ({ canvasElement }) => {
    await showsImage(canvasElement, PIXEL);
    shownText(canvasElement, "Acme Health");
  },
};

export const MarkOnly: Story = {
  args: { identity: { ...meta.args.identity, markUrl: PIXEL } },
  play: async ({ canvasElement }) => {
    await showsImage(canvasElement, PIXEL);
    await expect(shownImage(canvasElement)).toHaveAttribute("alt", "");
  },
};

export const MarkOnlyDark: Story = {
  ...MarkOnly,
  globals: { theme: "dark" },
};

export const AdminPortal: Story = {
  args: { chrome: "admin" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Admin portal")).toBeVisible();
    await expect(canvas.queryByText("Genie Ops Center")).toBeNull();
  },
};

// SVG is an allowed upload; a viewBox-only SVG has no intrinsic width, yet it is a good mark.
const VIEWBOX_SVG = svg("<rect width='10' height='10'/>");

export const WithSvgMark: Story = {
  args: { identity: { ...meta.args.identity, markUrl: VIEWBOX_SVG } },
  play: async ({ canvasElement }) => {
    const image = shownImage(canvasElement);

    await waitFor(() => expect(image?.complete).toBe(true));
    // Let a decode check settle before asserting the mark stayed.
    await image?.decode().catch(() => undefined);
    await showsImage(canvasElement, VIEWBOX_SVG);
  },
};

// An expired link, a missing file or a pending scan: never a broken image.
export const LogoFailsToLoad: Story = {
  args: {
    identity: {
      ...meta.args.identity,
      logoLightUrl: "/missing-logo.png",
      markUrl: PIXEL,
    },
  },
  play: async ({ canvasElement }) => {
    await showsImage(canvasElement, PIXEL);
    shownText(canvasElement, "Acme Health");
  },
};

export const MarkFailsToLoad: Story = {
  args: {
    identity: { ...meta.args.identity, markUrl: "/missing-mark.png" },
  },
  play: async ({ canvasElement }) => {
    await showsImage(canvasElement, DEFAULT_MARK_URL);
  },
};

const LONG_COMPANY =
  "Acme Regional Health and Community Care Services Cooperative";

export const LongNames: Story = {
  args: {
    identity: {
      companyName: LONG_COMPANY,
      productName:
        "Genie Ops Center for Regional Operations and Clinical Teams",
      ...NO_IMAGES,
    },
  },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.hover(canvas.getByText(LONG_COMPANY));

    const tip = await screen.findByText(LONG_COMPANY, {
      selector: "[data-slot=tooltip-content]",
    });

    // The tooltip fades in, so wait until it paints.
    await waitFor(() => expect(tip).toBeVisible());

    const block = canvasElement.querySelector<HTMLElement>(
      "[data-shell-identity]"
    );

    await expect(block).not.toBeNull();
    await expect(block?.scrollWidth).toBeLessThanOrEqual(
      block?.clientWidth ?? 0
    );
  },
};
