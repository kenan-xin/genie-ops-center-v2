import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { SignInFooter } from "./sign-in-footer.tsx";

const meta = {
  title: "Genie Ops/Sign-in/SignInFooter",
  component: SignInFooter,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The sign-in page footer: the support contact and the terms and privacy links from branding, then the product name. Only a valid support email or an http(s) URL becomes a link, so a stored javascript: value never renders as one.",
      },
    },
  },
  args: {
    productName: "Genie Ops Center",
    supportEmail: "help@example.invalid",
    supportUrl: null,
    termsUrl: "https://example.invalid/terms",
    privacyUrl: "https://example.invalid/privacy",
    termsLabel: "Terms of use",
    privacyLabel: "Privacy",
  },
} satisfies Meta<typeof SignInFooter>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SupportAndLegalLinks: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("link", { name: "help@example.invalid" })
    ).toHaveAttribute("href", "mailto:help@example.invalid");
    await expect(
      canvas.getByRole("link", { name: "Terms of use" })
    ).toHaveAttribute("href", "https://example.invalid/terms");
    await expect(canvas.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "https://example.invalid/privacy"
    );
  },
};

export const DangerousUrls: Story = {
  args: {
    supportEmail: null,
    supportUrl: "javascript:alert(1)",
    termsUrl: "javascript:alert(1)",
    privacyUrl: "javascript:alert(1)",
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.queryAllByRole("link")).toEqual([]);
    await expect(canvasElement.innerHTML).not.toContain("javascript:");
  },
};
