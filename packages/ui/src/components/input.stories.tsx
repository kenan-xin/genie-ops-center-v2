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
  InputGroup,
  InputGroupInput,
  Select,
  SelectTrigger,
  SelectValue,
  Textarea,
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

// czjw.65 (I6): every control shows its placeholder in the placeholder role, gray-500 in light,
// so a hint never reads as a value the person entered.
export const Placeholders: Story = {
  render: (args) => (
    <div className="flex flex-col gap-4">
      <Input {...args} aria-label="Input" placeholder="Search" />
      <Textarea aria-label="Textarea" placeholder="Add a note" />
      <InputGroup>
        <InputGroupInput aria-label="Input group" placeholder="DD Mon YYYY" />
      </InputGroup>
      <Select>
        <SelectTrigger aria-label="Select">
          <SelectValue placeholder="Choose the type" />
        </SelectTrigger>
      </Select>
    </div>
  ),
  play: async ({ canvas }) => {
    const gray500 = "rgb(107, 114, 128)";

    for (const name of ["Input", "Textarea", "Input group"]) {
      // oxlint-disable-next-line no-await-in-loop -- one control per check.
      await expect(
        getComputedStyle(canvas.getByRole("textbox", { name }), "::placeholder")
          .color
      ).toBe(gray500);
    }

    await expect(
      getComputedStyle(canvas.getByRole("combobox", { name: "Select" })).color
    ).toBe(gray500);
  },
};

export const Dark: Story = {
  ...Invalid,
  globals: { theme: "dark" },
};
