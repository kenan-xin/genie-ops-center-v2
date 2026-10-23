import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { NoGrantsEmptyState } from "./no-grants-empty-state.tsx";

/**
 * The home page when the viewer holds no solution grant (R-34): the tenant letter tile, one title,
 * one sentence, and a support contact only when branding has a valid one.
 */
const meta = {
  title: "Core/No-grants empty state",
  component: NoGrantsEmptyState,
  tags: ["autodocs"],
  args: {
    companyName: "Acme Health",
    title: "No solutions yet",
    description: "Ask your administrator to grant you access to a solution.",
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
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No solutions yet")).toBeVisible();
    await expect(
      canvas.getByText(
        "Ask your administrator to grant you access to a solution."
      )
    ).toBeVisible();

    await expect(canvas.getByText("A")).toBeInTheDocument();
    await expect(
      canvas.queryByText("A", { ignore: "[aria-hidden=true]" })
    ).toBeNull();

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

export const Phone: Story = {
  args: { contact: SUPPORT_EMAIL },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
