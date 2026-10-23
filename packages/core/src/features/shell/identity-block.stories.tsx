import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { IdentityBlock } from "./identity-block.tsx";

// A 1x1 transparent PNG: loads without a network request.
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/**
 * The shell's identity block (R-39): the tenant mark (the branding square mark, or the letter tile
 * when there is none or it fails to load), the company name, then the product name in the
 * workspace chrome or the Admin portal pill in the admin chrome.
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
      markUrl: null,
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

export const WorkspaceLetterTile: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("Acme Health")).toBeVisible();
    await expect(canvas.getByText("Genie Ops Center")).toBeVisible();
    await expect(canvas.getByText("A")).toBeInTheDocument();
    await expect(
      canvas.queryByText("A", { ignore: "[aria-hidden=true]" })
    ).toBeNull();
    await expect(canvasElement.querySelector("img")).toBeNull();
  },
};

export const AdminPortal: Story = {
  args: { chrome: "admin" },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Admin portal")).toBeVisible();
    await expect(canvas.queryByText("Genie Ops Center")).toBeNull();
  },
};

export const WithMark: Story = {
  args: {
    identity: {
      companyName: "Acme Health",
      productName: "Genie Ops Center",
      markUrl: PIXEL,
    },
  },
  play: async ({ canvasElement, canvas }) => {
    const image = canvasElement.querySelector("img");

    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute("alt", "");
    await expect(canvas.queryByText("A")).toBeNull();
  },
};

// SVG is an allowed upload; a viewBox-only SVG has no intrinsic width, yet it is a good mark.
const VIEWBOX_SVG = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'><rect width='10' height='10'/></svg>"
)}`;

export const WithSvgMark: Story = {
  args: {
    identity: {
      companyName: "Acme Health",
      productName: "Genie Ops Center",
      markUrl: VIEWBOX_SVG,
    },
  },
  play: async ({ canvasElement, canvas }) => {
    const image = canvasElement.querySelector("img");

    await waitFor(() => expect(image?.complete).toBe(true));
    // Let a decode check settle before asserting the mark stayed.
    await image?.decode().catch(() => undefined);
    await expect(canvasElement.querySelector("img")).toBeVisible();
    await expect(canvas.queryByText("A")).toBeNull();
  },
};

// An expired link, a missing file or a pending scan: never a broken image.
export const MarkFailsToLoad: Story = {
  args: {
    identity: {
      companyName: "Acme Health",
      productName: "Genie Ops Center",
      markUrl: "/missing-mark.png",
    },
  },
  play: async ({ canvasElement, canvas }) => {
    await waitFor(() => expect(canvasElement.querySelector("img")).toBeNull());
    await expect(canvas.getByText("A")).toBeInTheDocument();
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
      markUrl: null,
    },
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText(LONG_COMPANY)).toHaveAttribute(
      "title",
      LONG_COMPANY
    );

    const block = canvasElement.querySelector<HTMLElement>(
      "[data-shell-identity]"
    );

    await expect(block).not.toBeNull();
    await expect(block?.scrollWidth).toBeLessThanOrEqual(
      block?.clientWidth ?? 0
    );
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
};
