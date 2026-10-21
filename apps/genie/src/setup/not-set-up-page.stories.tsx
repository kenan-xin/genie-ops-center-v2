import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { NotSetUpPage } from "./not-set-up-page.tsx";

const meta = {
  title: "Genie Ops/Setup/NotSetUpPage",
  component: NotSetUpPage,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A neutral, standalone setup-progress page shown on every route until all setup steps known by the running image are done. It has no visitor action and no tenant branding because branding may not exist yet.",
      },
    },
  },
} satisfies Meta<typeof NotSetUpPage>;

export default meta;

type Story = StoryObj<typeof meta>;

const FRESH_STEPS = [
  { step: "migrations", state: "pending", detail: null },
  { step: "seed", state: "pending", detail: null },
] as const;

const assertFreshDeployment: NonNullable<Story["play"]> = async ({
  canvas,
}) => {
  await expect(
    canvas.getByRole("heading", { name: "This deployment is not set up yet" })
  ).toBeVisible();
  await expect(
    canvas.getByText(
      "An operator must finish genie-ops setup before anyone can sign in."
    )
  ).toBeVisible();
  await expect(canvas.getByRole("list", { name: "Setup steps" })).toBeVisible();
  await expect(canvas.getByText("migrations")).toBeVisible();
  await expect(canvas.getByText("seed")).toBeVisible();

  // Standalone page: no application navigation and no visitor action.
  await expect(canvas.queryByRole("navigation")).not.toBeInTheDocument();
  await expect(canvas.queryAllByRole("button")).toHaveLength(0);
  await expect(canvas.queryAllByRole("link")).toHaveLength(0);
};

export const FreshDeployment: Story = {
  args: { steps: FRESH_STEPS },
  play: assertFreshDeployment,
};

export const FailedStep: Story = {
  args: {
    steps: [
      { step: "migrations", state: "done", detail: null },
      { step: "seed", state: "failed", detail: "Seed could not be completed." },
    ],
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("migrations")).toBeVisible();
    await expect(canvas.getByText("done")).toBeVisible();
    await expect(canvas.getByText("failed")).toBeVisible();
    await expect(
      canvas.getByText("Seed could not be completed.")
    ).toBeVisible();
  },
};

export const Phone: Story = {
  args: { steps: FRESH_STEPS },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: assertFreshDeployment,
};

export const Desktop: Story = {
  args: { steps: FRESH_STEPS },
  globals: { viewport: { value: "desktop", isRotated: false } },
  play: assertFreshDeployment,
};
