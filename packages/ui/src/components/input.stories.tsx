import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, type screen, userEvent } from "storybook/test";

// The package entry, not ./input.tsx, so that the stories prove what an app
// can import.
import {
  DatePicker,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
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
          "The shadcn Input on the Base UI primitive (`@base-ui/react/input`), fitted to the tokens.md scale: sm 32 px, md (default) 36 px from `lg` and 40 px under it, lg 44 px, a `border-input` boundary and one focus ring. Pair it with `Field` and `FieldLabel htmlFor`; `aria-invalid` turns the boundary red and `aria-describedby` points at a `FieldError`.",
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

    await expect(heights).toEqual([32, 36, 44]);
  },
};

/** czjw.186: the dense field, 32 px from `lg` and 40 px under it, as a review form uses it. */
export const Dense: Story = {
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  render: (args) => (
    <Input {...args} size="dense" aria-label="Dense" placeholder="Search" />
  ),
  play: async ({ canvas }) => {
    const height = canvas
      .getByRole("textbox", { name: "Dense" })
      .getBoundingClientRect().height;

    await expect(Math.round(height)).toBe(32);
  },
};

// 6wz1.94: every field kind is one box of the field height, border included, so a form row of
// mixed fields lines up. A group must not add its border, nor an addon its padding.
const fieldKinds = (
  <div className="flex flex-col gap-4">
    <Input aria-label="Name" />
    <InputGroup data-testid="amount">
      <InputGroupInput aria-label="Amount" />
      <InputGroupAddon>
        <InputGroupText>SGD</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
    <DatePicker
      aria-label="Due date"
      pickLabel="Choose the due date"
      value=""
      onValueChange={() => {}}
    />
    <Select>
      <SelectTrigger aria-label="Type">
        <SelectValue placeholder="Choose the type" />
      </SelectTrigger>
    </Select>
  </div>
);

const fieldHeights = (canvasElement: HTMLElement) =>
  [
    "[data-slot=input]",
    "[data-testid=amount]",
    "[data-slot=input-group]:not([data-testid])",
    "[data-slot=select-trigger]",
  ].map(
    (selector) =>
      canvasElement.querySelector(selector)?.getBoundingClientRect().height
  );

export const OneFieldHeightDesktop: Story = {
  name: "One field height, desktop",
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  render: () => fieldKinds,
  play: async ({ canvasElement }) => {
    await expect(fieldHeights(canvasElement)).toEqual([36, 36, 36, 36]);
  },
};

export const OneFieldHeightPhone: Story = {
  name: "One field height, phone",
  globals: { viewport: { value: "phone390", isRotated: false } },
  render: () => fieldKinds,
  play: async ({ canvasElement }) => {
    await expect(fieldHeights(canvasElement)).toEqual([40, 40, 40, 40]);
  },
};

// 6wz1.114 (T2-a): under lg a field box reaches 44 px through its touch area, and the area sits
// under the native field, so a tap on the field still lands on the <input> (caret, iOS keyboard).
async function expectFieldTouchArea(input: HTMLElement) {
  const box = input.closest<HTMLElement>(
    "[data-slot=input-box], [data-slot=input-group]"
  );

  await expect(box).not.toBeNull();

  if (box === null) return;

  const area = box.getBoundingClientRect();
  const centerX = area.left + area.width / 2;
  const field = input.getBoundingClientRect();

  await expect(document.elementFromPoint(centerX, area.top - 1.5)).toBe(box);
  await expect(document.elementFromPoint(centerX, area.bottom + 1.5)).toBe(box);
  await expect(
    document.elementFromPoint(
      field.left + field.width / 2,
      field.top + field.height / 2
    )
  ).toBe(input);

  await userEvent.click(box);
  await expect(input).toHaveFocus();
}

export const FieldTouchAreaOnPhone: Story = {
  globals: { viewport: { value: "phone390", isRotated: false } },
  render: () => (
    // The padding keeps the taps above the first field inside the viewport.
    <div className="flex flex-col gap-6 p-4">
      <Input aria-label="Name" />
      <InputGroup>
        <InputGroupInput aria-label="Amount" />
        <InputGroupAddon align="inline-end">
          <InputGroupText>SGD</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </div>
  ),
  play: async ({ canvas }) => {
    await expectFieldTouchArea(canvas.getByRole("textbox", { name: "Name" }));
    await expectFieldTouchArea(canvas.getByRole("textbox", { name: "Amount" }));
  },
};

// 6wz1.114 (T2-b): a field reads 16 px under lg at every root preset, so iOS Safari does not zoom
// on focus, and text-sm of the root from lg.
const fieldTexts = (
  <div className="flex flex-col gap-4">
    <Input aria-label="Name" />
    <InputGroup>
      <InputGroupInput aria-label="Amount" />
    </InputGroup>
    <Textarea aria-label="Note" />
    <DatePicker
      aria-label="Due date"
      pickLabel="Choose the due date"
      value=""
      onValueChange={() => {}}
    />
  </div>
);

const fieldFontSizes = (canvas: { getByRole: typeof screen.getByRole }) =>
  ["Name", "Amount", "Note", "Due date"].map(
    (name) => getComputedStyle(canvas.getByRole("textbox", { name })).fontSize
  );

export const PhoneFieldText: Story = {
  globals: { viewport: { value: "phone390", isRotated: false } },
  // The Compact preset: a root that follows it would read 14 px.
  beforeEach: () => {
    document.documentElement.style.fontSize = "14px";

    return () => {
      document.documentElement.style.fontSize = "";
    };
  },
  render: () => fieldTexts,
  play: async ({ canvas }) => {
    await expect(fieldFontSizes(canvas)).toEqual([
      "16px",
      "16px",
      "16px",
      "16px",
    ]);
  },
};

export const DesktopFieldText: Story = {
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  render: () => fieldTexts,
  play: async ({ canvas }) => {
    await expect(fieldFontSizes(canvas)).toEqual([
      "13.125px",
      "13.125px",
      "13.125px",
      "13.125px",
    ]);
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
