import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../index.ts";

const meta = {
  title: "UI/Card",
  component: Card,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A bordered surface that groups one block of a page: a header with a title, a description and an optional action, then its content. Set `--card-spacing` to change the inner padding.",
      },
    },
    a11y: { test: "error" },
  },
  args: {
    className: "w-96",
    children: (
      <>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>Where you are signed in right now.</CardDescription>
          <CardAction>
            <Button variant="secondary" size="sm">
              Sign out all
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>Three devices.</CardContent>
      </>
    ),
  },
} satisfies Meta<typeof Card>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Dark: Story = {
  globals: { theme: "dark" },
};
