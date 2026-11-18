import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import * as React from "react";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";

// The package entry, so that the stories prove what an app can import.
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
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

function ChipsStory() {
  const [value, setValue] = React.useState<Person[]>([people[0]!]);
  const anchor = React.useRef<HTMLDivElement | null>(null);

  return (
    <Combobox<Person, true>
      multiple
      items={people}
      value={value}
      onValueChange={setValue}
    >
      <ComboboxChips ref={anchor}>
        {value.map((person) => (
          <ComboboxChip
            key={person.value}
            removeLabel={`Remove ${person.label}`}
          >
            {person.label}
          </ComboboxChip>
        ))}
        <ComboboxChipsInput
          aria-label="People"
          placeholder={value.length > 0 ? "Add more" : "Search people"}
        />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
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
  );
}

/** Several picks as chips (P12-14): each chip has a remove button named after it. */
export const Chips: Story = {
  render: ChipsStory,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("combobox", { name: "People" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "Grace Hopper" })
    );

    // The list stays open in multiple mode, and while it is open Base UI hides the chips from
    // the accessibility tree, so it is closed before the remove buttons are read.
    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        canvas.getByRole("button", { name: "Remove Grace Hopper" })
      ).toBeInTheDocument();
      expect(
        canvas.getByRole("button", { name: "Remove Ada Lovelace" })
      ).toBeInTheDocument();
    });

    await userEvent.click(
      canvas.getByRole("button", { name: "Remove Ada Lovelace" })
    );

    await waitFor(() =>
      expect(
        canvas.queryByRole("button", { name: "Remove Ada Lovelace" })
      ).toBeNull()
    );
    // The remove button hands the focus back to the field.
    await expect(
      canvas.getByRole("combobox", { name: "People" })
    ).toHaveFocus();
  },
};

// 6wz1.114: the chips field is a field box, so it lines up with the other text fields: 36 px
// from lg, 40 px under it with a 44 px touch area, also with a chip in it.
const chipsField = (
  <div className="p-4">
    <Combobox<Person, true> multiple items={people} defaultValue={[people[0]!]}>
      <ComboboxChips>
        <ComboboxChip removeLabel="Remove Ada Lovelace">
          Ada Lovelace
        </ComboboxChip>
        <ComboboxChipsInput aria-label="People" />
      </ComboboxChips>
      <ComboboxContent>
        <ComboboxList>
          {(person: Person) => (
            <ComboboxItem key={person.value} value={person}>
              {person.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  </div>
);

const chipsBox = (canvasElement: HTMLElement) =>
  canvasElement.querySelector<HTMLElement>("[data-slot=combobox-chips]")!;

export const ChipsFieldHeightDesktop: Story = {
  name: "Chips field height, desktop",
  globals: { viewport: { value: "desktop1440", isRotated: false } },
  render: () => chipsField,
  play: async ({ canvasElement }) => {
    await expect(chipsBox(canvasElement).getBoundingClientRect().height).toBe(
      36
    );
  },
};

export const ChipsFieldTouchAreaOnPhone: Story = {
  name: "Chips field height and touch area, phone",
  globals: { viewport: { value: "phone390", isRotated: false } },
  render: () => chipsField,
  play: async ({ canvas, canvasElement }) => {
    const box = chipsBox(canvasElement);
    const input = canvas.getByRole("combobox", { name: "People" });
    const area = box.getBoundingClientRect();
    const centerX = area.left + area.width / 2;

    await expect(area.height).toBe(40);
    await expect(document.elementFromPoint(centerX, area.top - 1.5)).toBe(box);
    await expect(document.elementFromPoint(centerX, area.bottom + 1.5)).toBe(
      box
    );

    await userEvent.click(box);
    await expect(input).toHaveFocus();
  },
};

/** The box's touch area lies under its children, so a tap on a remove button reaches the button. */
export const ChipRemoveTapOnPhone: Story = {
  name: "Chip remove tap, phone",
  globals: { viewport: { value: "phone390", isRotated: false } },
  render: ChipsStory,
  play: async ({ canvas }) => {
    const remove = canvas.getByRole("button", { name: "Remove Ada Lovelace" });
    const area = remove.getBoundingClientRect();

    // The tap's target: the button itself, not the box's touch layer.
    await expect(
      remove.contains(
        document.elementFromPoint(
          area.left + area.width / 2,
          area.top + area.height / 2
        )
      )
    ).toBe(true);

    await userEvent.click(remove);

    await waitFor(() =>
      expect(
        canvas.queryByRole("button", { name: "Remove Ada Lovelace" })
      ).toBeNull()
    );
    // As in Chips: the remove button hands the focus back to the field.
    await expect(
      canvas.getByRole("combobox", { name: "People" })
    ).toHaveFocus();
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
