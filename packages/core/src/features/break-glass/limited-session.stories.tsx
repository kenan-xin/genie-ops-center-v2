import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { LimitedSessionPage } from "./limited-session.tsx";
/* oxlint-disable anti-slop/require-readable-spacing -- story spies and fixtures stay together. */

/**
 * The limited-session page (R-30, R-65): shown while the break-glass account still has to change
 * its password or enroll an authenticator, with a checklist and one "Continue setup" action.
 */
const onContinueSetup = fn();

const meta = {
  title: "Core/Limited-session page",
  component: LimitedSessionPage,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The standalone page every other route shows while the break-glass session is limited. One action returns to the break-glass flow at the first unmet step.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    productName: "Genie Ops Center",
    passwordChanged: false,
    authenticatorEnrolled: false,
    onContinueSetup,
  },
} satisfies Meta<typeof LimitedSessionPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const BothOutstanding: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole("heading", {
        name: "Finish setting up your account",
      })
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("Change your temporary password")
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("Enroll an authenticator app")
    ).toBeInTheDocument();

    // Both items are outstanding: two "To do:" announcements and no "Done:".
    await expect(canvas.getAllByText("To do:")).toHaveLength(2);
    await expect(canvas.queryByText("Done:")).not.toBeInTheDocument();
  },
};

export const PasswordDone: Story = {
  args: { passwordChanged: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getAllByText("Done:")).toHaveLength(1);
    await expect(canvas.getAllByText("To do:")).toHaveLength(1);
  },
};

export const Continue: Story = {
  play: async ({ canvasElement }) => {
    onContinueSetup.mockClear();

    await userEvent.click(
      within(canvasElement).getByRole("link", { name: "Continue setup" })
    );

    await expect(onContinueSetup).toHaveBeenCalledTimes(1);
  },
};
