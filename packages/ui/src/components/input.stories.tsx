import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent } from "storybook/test";

// The package entry, not ./input.tsx, so that the stories prove what an app
// can import.
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
} from "../index.ts";

const meta = {
  title: "UI/Input",
  component: Input,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The shadcn Input on the Base UI primitive (`@base-ui/react/input`), fitted to the tokens.md scale: sm 32 px, md 40 px (default), lg 44 px, a `border-input` boundary and one focus ring. Pair it with `Field` and `FieldLabel htmlFor`; `aria-invalid` turns the boundary red and `aria-describedby` points at a `FieldError`.",
      },
    },
  },
} satisfies Meta<typeof Input>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Field>
      <FieldLabel htmlFor="email">Email</FieldLabel>
      <Input {...args} id="email" type="email" />
      <FieldDescription>We only use it to sign you in.</FieldDescription>
    </Field>
  ),
  play: async ({ canvas }) => {
    const input = canvas.getByRole("textbox", { name: "Email" });

    await expect(input.getBoundingClientRect().height).toBe(40);

    await userEvent.tab();
    await expect(input).toHaveFocus();
    await expect(getComputedStyle(input).boxShadow).toContain(
      "rgb(37, 99, 235)"
    );
  },
};

export const Invalid: Story = {
  render: (args) => (
    <Field>
      <FieldLabel htmlFor="email">Email</FieldLabel>
      <Input
        {...args}
        id="email"
        type="email"
        aria-invalid
        aria-describedby="email-error"
        defaultValue="not-an-email"
      />
      <FieldError id="email-error">Enter a valid email</FieldError>
    </Field>
  ),
  play: async ({ canvas }) => {
    const input = canvas.getByRole("textbox", { name: "Email" });

    await expect(input).toHaveAccessibleDescription("Enter a valid email");
    await expect(input).toBeInvalid();
  },
};

export const Sizes: Story = {
  globals: { viewport: { value: "desktop", isRotated: false } },
  render: (args) => (
    <div className="flex items-center gap-4">
      <Input {...args} size="sm" aria-label="Small" />
      <Input {...args} size="md" aria-label="Medium" />
      <Input {...args} size="lg" aria-label="Large" />
    </div>
  ),
  play: async ({ canvas }) => {
    const heights = canvas
      .getAllByRole("textbox")
      .map((input) => input.getBoundingClientRect().height);

    await expect(heights).toEqual([32, 40, 44]);
  },
};

export const Dark: Story = {
  ...Invalid,
  globals: { theme: "dark" },
};
