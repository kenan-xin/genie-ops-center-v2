"use client";

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
} from "@genie/ui";
import type { ReactNode } from "react";

import type { AccessRecipient } from "../../services/roles/effective-access.ts";
import type { GrantRecipients } from "../../services/roles/grants.ts";

export type PickerChoice<V> = {
  /** Unique in the list, for example "group:g-ops". */
  readonly key: string;
  readonly name: string;
  /** A member count, an email, a module description, or "Switched off". */
  readonly detail: string;
  readonly value: V;
};

export type PickerGroup<V> = {
  /** The caption. It shows only when the list has two or more groups. */
  readonly label: string;
  readonly choices: readonly PickerChoice<V>[];
};

/** The shape Base UI reads as a grouped list. */
type Section<V> = {
  readonly label: string;
  readonly items: readonly PickerChoice<V>[];
};

const labelOf = (choice: PickerChoice<unknown>) =>
  `${choice.name} · ${choice.detail}`;

/**
 * A searchable choice of one item in captioned groups (O13): the Grants recipient and the Overview
 * subject. The search covers the name and the detail, so a person's email finds them when two
 * people share a name.
 */
export function ChoicePicker<V>(props: {
  readonly prompt: string;
  readonly searchLabel: string;
  readonly empty: string;
  readonly groups: readonly PickerGroup<V>[];
  /** The key of the picked choice. */
  readonly value: string | null;
  /** Grants shows "name · detail" in the trigger, Overview only the name. */
  readonly trigger: "name" | "name-and-detail";
  readonly onPick: (value: V) => void;
}): ReactNode {
  const sections: readonly Section<V>[] = props.groups.map((group) => ({
    label: group.label,
    items: group.choices,
  }));

  const captions = sections.length > 1;

  const picked =
    props.groups
      .flatMap((group) => group.choices)
      .find((choice) => choice.key === props.value) ?? null;

  return (
    <Combobox<PickerChoice<V>>
      items={sections}
      value={picked}
      itemToStringLabel={labelOf}
      isItemEqualToValue={(item, value) => item.key === value.key}
      filter={(choice, query) =>
        labelOf(choice).toLowerCase().includes(query.trim().toLowerCase())
      }
      onValueChange={(choice: PickerChoice<V> | null) => {
        if (choice !== null) props.onPick(choice.value);
      }}
    >
      {/* A combobox takes no name from its text, so the prompt names it and the text shows the pick. */}
      <ComboboxTrigger aria-label={props.prompt}>
        {picked === null
          ? props.prompt
          : props.trigger === "name"
            ? picked.name
            : labelOf(picked)}
      </ComboboxTrigger>
      {/* With the search inside, the popup is a dialog, which needs a name. */}
      <ComboboxContent aria-label={props.prompt}>
        <div className="border-b border-border p-2">
          <ComboboxInput aria-label={props.searchLabel} placeholder="Search" />
        </div>
        <ComboboxEmpty>{props.empty}</ComboboxEmpty>
        <ComboboxList>
          {(section: Section<V>) => (
            <ComboboxGroup key={section.label} items={section.items}>
              {captions ? <ComboboxLabel>{section.label}</ComboboxLabel> : null}
              <ComboboxCollection>
                {(choice: PickerChoice<V>) => (
                  <ComboboxItem key={choice.key} value={choice}>
                    {labelOf(choice)}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

const COPY = {
  group: {
    prompt: "Choose a group",
    search: "Search groups",
    empty: "No group matches.",
  },
  user: {
    prompt: "Choose a person",
    search: "Search people",
    empty: "No person matches.",
  },
} as const;

const members = (count: number) =>
  `${count} ${count === 1 ? "member" : "members"}`;

/** The groups of a recipients read as picker choices, each with its member count. */
export const groupChoices = (
  recipients: GrantRecipients
): readonly PickerChoice<AccessRecipient>[] =>
  recipients.groups.map((group) => ({
    key: `group:${group.id}`,
    name: group.name,
    detail: members(group.memberCount),
    value: { type: "group", id: group.id },
  }));

/** The people of a recipients read as picker choices, each with the email. */
export const personChoices = (
  recipients: GrantRecipients
): readonly PickerChoice<AccessRecipient>[] =>
  recipients.people.map((person) => ({
    key: `user:${person.id}`,
    name: person.name,
    detail: person.email,
    value: { type: "user", id: person.id },
  }));

/**
 * Who the Grants tab edits (R-37a): a group, or a person as the exception. The search covers the
 * name and a person's email, because two people can share a name.
 */
export function RecipientPicker(props: {
  readonly kind: AccessRecipient["type"];
  readonly recipients: GrantRecipients;
  readonly value: AccessRecipient | null;
  readonly onPick: (recipient: AccessRecipient) => void;
}): ReactNode {
  const copy = COPY[props.kind];

  return (
    <ChoicePicker<AccessRecipient>
      prompt={copy.prompt}
      searchLabel={copy.search}
      empty={copy.empty}
      groups={[
        {
          label: props.kind === "group" ? "Groups" : "People",
          choices:
            props.kind === "group"
              ? groupChoices(props.recipients)
              : personChoices(props.recipients),
        },
      ]}
      value={
        props.value?.type === props.kind
          ? `${props.value.type}:${props.value.id}`
          : null
      }
      trigger="name-and-detail"
      onPick={props.onPick}
    />
  );
}
