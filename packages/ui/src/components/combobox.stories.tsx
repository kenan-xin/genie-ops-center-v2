import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";

// The package entry, so that the stories prove what an app can import.
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
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

/** The search inside the popup: a trigger shows the choice, and the field opens with the list. */
export const WithTrigger: Story = {
  render: () => (
    <Combobox<Person> items={people} value={null} onValueChange={fn()}>
      <ComboboxTrigger aria-label="Person">Choose a person</ComboboxTrigger>
      <ComboboxContent>
        <div className="p-2">
          <ComboboxInput aria-label="Search people" placeholder="Search" />
        </div>
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
  ),
};

type Section = { readonly label: string; readonly items: readonly Person[] };

const sections: readonly Section[] = [
  {
    label: "Groups",
    items: [
      { value: "g-1", label: "Finance team" },
      { value: "g-2", label: "Operations" },
    ],
  },
  { label: "People", items: people },
];

/** Sections with captions: a search keeps only the captions of the sections that still match. */
export const Grouped: Story = {
  render: () => (
    <Combobox<Person> items={sections} value={null} onValueChange={fn()}>
      <ComboboxTrigger aria-label="Recipient">
        Choose a recipient
      </ComboboxTrigger>
      {/* With the search inside, the popup is a dialog, which needs a name. */}
      <ComboboxContent aria-label="Recipients">
        <div className="p-2">
          <ComboboxInput aria-label="Search recipients" placeholder="Search" />
        </div>
        <ComboboxEmpty>Nothing matches.</ComboboxEmpty>
        <ComboboxList>
          {(section: Section) => (
            <ComboboxGroup key={section.label} items={section.items}>
              <ComboboxLabel>{section.label}</ComboboxLabel>
              <ComboboxCollection>
                {(person: Person) => (
                  <ComboboxItem key={person.value} value={person}>
                    {person.label}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  ),
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "Recipient" }));

    // The popup fades in from opacity 0.
    await waitFor(() =>
      expect(screen.getByRole("group", { name: "Groups" })).toBeVisible()
    );
    await expect(screen.getByRole("group", { name: "People" })).toBeVisible();

    await userEvent.type(
      screen.getByRole("combobox", { name: "Search recipients" }),
      "grace"
    );

    await waitFor(() =>
      expect(screen.queryByRole("group", { name: "Groups" })).toBeNull()
    );
    await expect(screen.getByRole("group", { name: "People" })).toBeVisible();
    await expect(screen.getAllByRole("option")).toHaveLength(1);
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
