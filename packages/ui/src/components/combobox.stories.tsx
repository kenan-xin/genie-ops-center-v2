import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";

// The package entry, so that the stories prove what an app can import.
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  Field,
  FieldLabel,
} from "../index.ts";

type Person = { readonly value: string; readonly label: string };

const people: readonly Person[] = [
  { value: "p-1", label: "Ada Lovelace" },
  { value: "p-2", label: "Grace Hopper" },
];

const meta = {
  title: "UI/Combobox",
  component: Combobox,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The shadcn Combobox on the Base UI primitive (`@base-ui/react/combobox`), trimmed to a search field and its list. Typing narrows the `items`; a pick fires `onValueChange` with the item. Keep `value` at `null` and clear the input for a search that acts on each pick, as the group inspector's Add members does. The rows share the Select item height and highlight.",
      },
    },
    a11y: { test: "error" },
  },
  render: () => (
    <Field>
      <FieldLabel htmlFor="person-search">Add members</FieldLabel>
      <Combobox<Person> items={people} value={null} onValueChange={fn()}>
        <ComboboxInput id="person-search" placeholder="Search people" />
        <ComboboxContent>
          <ComboboxEmpty>No one matches.</ComboboxEmpty>
          <ComboboxList>
            {(person: Person) => (
              <ComboboxItem key={person.value} value={person}>
                {person.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  ),
} satisfies Meta<typeof Combobox>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await userEvent.type(
      canvas.getByRole("combobox", { name: "Add members" }),
      "zz"
    );

    // A search that matches nobody says so instead of an empty popup.
    await waitFor(() =>
      expect(screen.getByText("No one matches.")).toBeVisible()
    );
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole("combobox", { name: "Add members" })
    );
    await expect(
      await screen.findByRole("option", { name: "Grace Hopper" })
    ).toBeInTheDocument();
  },
};
