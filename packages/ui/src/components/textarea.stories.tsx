import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent } from "storybook/test";

// The package entry, not ./textarea.tsx, so that the stories prove what an app can import.
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Textarea,
} from "../index.ts";

const meta = {
  title: "UI/Textarea",
  component: Textarea,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The shadcn Textarea fitted to the tokens.md scale: the Input's card fill, 12 px padding, small text and shared focus ring, a `border-input` boundary, and a minimum height of 64 px. Pair it with `Field` and `FieldLabel htmlFor`; `aria-invalid` turns the boundary red and `aria-describedby` points at a `FieldError`.",
      },
    },
  },
} satisfies Meta<typeof Textarea>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Field>
      <FieldLabel htmlFor="notice">System-use notice</FieldLabel>
      <Textarea {...args} id="notice" rows={4} />
      <FieldDescription>
        The text every person reads before signing in.
      </FieldDescription>
    </Field>
  ),
  play: async ({ canvas }) => {
    const textarea = canvas.getByRole("textbox", { name: "System-use notice" });

    // Four rows: the height grows with the rows, not with the input's control height.
    await expect(textarea.getBoundingClientRect().height).toBeGreaterThan(64);

    await userEvent.click(textarea);
    await expect(textarea).toHaveFocus();
    await expect(getComputedStyle(textarea).boxShadow).toContain(
      "rgb(37, 99, 235)"
    );
  },
};

export const Invalid: Story = {
  render: (args) => (
    <Field>
      <FieldLabel htmlFor="notice">System-use notice</FieldLabel>
      <Textarea
        {...args}
        id="notice"
        aria-invalid
        aria-describedby="notice-error"
        defaultValue="Too long"
      />
      <FieldError id="notice-error">The notice is too long</FieldError>
    </Field>
  ),
  play: async ({ canvas }) => {
    const textarea = canvas.getByRole("textbox", { name: "System-use notice" });

    await expect(textarea).toBeInvalid();
    await expect(textarea).toHaveAccessibleDescription(
      "The notice is too long"
    );
  },
};

export const Dark: Story = {
  ...Invalid,
  globals: { theme: "dark" },
};
