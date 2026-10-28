import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EyeIcon, SearchIcon } from "lucide-react";

// The package entry, not ./input-group.tsx, so that the stories prove what an app can import.
import {
  Field,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "../index.ts";

const meta = {
  title: "UI/Input Group",
  component: InputGroup,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The shadcn Input Group (`@shadcn/input-group`): one bordered field that holds an `InputGroupInput` and an `InputGroupAddon` at `inline-start` or `inline-end`. The addon holds text, an icon or an `InputGroupButton` (ghost, `icon-sm` by default, 32 px with a 44 px hit area). The group shows the focus ring when its input has keyboard focus. Use it for a control inside a field, for example the password reveal.",
      },
    },
  },
} satisfies Meta<typeof InputGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const PasswordReveal: Story = {
  render: () => (
    <Field>
      <FieldLabel htmlFor="password">Password</FieldLabel>
      <InputGroup>
        <InputGroupInput id="password" type="password" size="lg" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton aria-label="Show password" aria-pressed={false}>
            <EyeIcon aria-hidden="true" />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  ),
};

export const LeadingIcon: Story = {
  render: () => (
    <InputGroup>
      <InputGroupInput aria-label="Search people" placeholder="Search" />
      <InputGroupAddon>
        <InputGroupText>
          <SearchIcon aria-hidden="true" />
        </InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  ),
};

export const Dark: Story = {
  ...PasswordReveal,
  globals: { theme: "dark" },
};
