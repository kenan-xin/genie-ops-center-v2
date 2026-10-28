import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { NoGrantsEmptyState } from "./no-grants-empty-state.tsx";

const MARK_URL = "/brand/icon-blue.svg?tenant";

/**
 * The home page when the viewer has no workspace entry (R-34): the framed empty state with the
 * company mark tile, one title, one sentence, and a support contact only when branding has a valid
 * one.
 */
const meta = {
  title: "Core/No-grants empty state",
  component: NoGrantsEmptyState,
  tags: ["autodocs"],
  args: {
    identity: {
      companyName: "Acme Health",
      productName: "Genie Ops Center",
      logoLightUrl: null,
      logoDarkUrl: null,
      markUrl: MARK_URL,
    },
    title: "Nothing to open yet",
    description: "Ask your administrator for access.",
  },
} satisfies Meta<typeof NoGrantsEmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

const SUPPORT_EMAIL = {
  href: "mailto:help@acme.example",
  label: "Contact Acme Health support",
};

export const WithSupportEmail: Story = {
  args: { contact: SUPPORT_EMAIL },
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole("heading", { level: 2, name: "Nothing to open yet" })
    ).toBeVisible();
    await expect(
      canvas.getByText("Ask your administrator for access.")
    ).toBeVisible();
    // The tile carries the tenant's own mark, not the default one.
    await expect(
      canvasElement.querySelector('[data-slot="empty-icon"] img')
    ).toHaveAttribute("src", MARK_URL);

    const link = canvas.getByRole("link", {
      name: "Contact Acme Health support",
    });

    await expect(link).toHaveAttribute("href", "mailto:help@acme.example");
    // A native anchor: no role override, so no button emulation.
    await expect(link.getAttribute("role")).toBeNull();
  },
};

export const WithSupportPage: Story = {
  args: {
    contact: {
      href: "https://support.acme.example",
      label: "Contact Acme Health support",
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("link", { name: "Contact Acme Health support" })
    ).toHaveAttribute("href", "https://support.acme.example");
  },
};

export const WithoutSupportContact: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("link")).toBeNull();
  },
};

export const Dark: Story = {
  args: { contact: SUPPORT_EMAIL },
  globals: { theme: "dark" },
};

export const DarkWithoutSupportContact: Story = {
  globals: { theme: "dark" },
};

export const Phone: Story = {
  args: { contact: SUPPORT_EMAIL },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
