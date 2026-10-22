import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { SignInAction } from "./sign-in-action.tsx";

const meta = {
  title: "Genie Ops/Sign-in/SignInAction",
  component: SignInAction,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The action block of the sign-in page: the tenant's system-use notice, the optional acknowledgement checkbox that gates the action, and the one company-account sign-in action. A notice with no text never gates the action, so a person can always sign in.",
      },
    },
  },
  args: {
    notice: null,
    requiresAcknowledgement: false,
    label: "Sign in with your company account",
    acknowledgeLabel: "I acknowledge these conditions.",
  },
} satisfies Meta<typeof SignInAction>;

export default meta;

type Story = StoryObj<typeof meta>;

const NOTICE = "This system is for authorized staff only. Activity is logged.";

const assertOpenAction: NonNullable<Story["play"]> = async ({
  canvas,
  args,
}) => {
  await expect(canvas.getByRole("link", { name: args.label })).toHaveAttribute(
    "href",
    "/api/auth/sign-in/keycloak"
  );
  await expect(canvas.queryByRole("checkbox")).not.toBeInTheDocument();
};

export const Default: Story = {
  play: async (context) => {
    await assertOpenAction(context);
    await expect(
      context.canvas.queryByTestId("sign-in-notice")
    ).not.toBeInTheDocument();
  },
};

export const NoticeOnly: Story = {
  args: { notice: NOTICE },
  play: async (context) => {
    await expect(
      context.canvas.getByTestId("sign-in-notice")
    ).toHaveTextContent(NOTICE);
    await assertOpenAction(context);
  },
};

export const NoticeWithAcknowledgement: Story = {
  args: { notice: NOTICE, requiresAcknowledgement: true },
  play: async ({ canvas, args, userEvent }) => {
    await expect(
      canvas.getByRole("button", { name: args.label })
    ).toBeDisabled();
    await expect(
      canvas.queryByRole("link", { name: args.label })
    ).not.toBeInTheDocument();

    await userEvent.click(
      canvas.getByRole("checkbox", { name: args.acknowledgeLabel })
    );

    await expect(
      canvas.getByRole("link", { name: args.label })
    ).toHaveAttribute("href", "/api/auth/sign-in/keycloak");
  },
};

export const AcknowledgementWithoutNotice: Story = {
  args: { notice: "  ", requiresAcknowledgement: true },
  play: async (context) => {
    await assertOpenAction(context);
    await expect(
      context.canvas.queryByTestId("sign-in-notice")
    ).not.toBeInTheDocument();
  },
};

export const Dark: Story = {
  args: { notice: NOTICE, requiresAcknowledgement: true },
  globals: { theme: "dark" },
};
