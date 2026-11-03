"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@genie/ui";
import type { ReactNode } from "react";

import type { AccessRecipient } from "../../services/roles/effective-access.ts";
import type { GrantRecipients } from "../../services/roles/grants.ts";

type Choice = {
  readonly id: string;
  readonly name: string;
  /** The member count of a group, or the email of a person. */
  readonly detail: string;
};

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

const labelOf = (choice: Choice) => `${choice.name} · ${choice.detail}`;

function choicesOf(
  kind: AccessRecipient["type"],
  recipients: GrantRecipients
): readonly Choice[] {
  return kind === "group"
    ? recipients.groups.map((group) => ({
        id: group.id,
        name: group.name,
        detail: `${group.memberCount} ${group.memberCount === 1 ? "member" : "members"}`,
      }))
    : recipients.people.map((person) => ({
        id: person.id,
        name: person.name,
        detail: person.email,
      }));
}

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

  const choices = choicesOf(props.kind, props.recipients);

  const picked =
    props.value?.type === props.kind
      ? (choices.find((choice) => choice.id === props.value?.id) ?? null)
      : null;

  return (
    <Combobox<Choice>
      items={choices}
      value={picked}
      itemToStringLabel={labelOf}
      isItemEqualToValue={(item, value) => item.id === value.id}
      filter={(choice, query) =>
        labelOf(choice).toLowerCase().includes(query.trim().toLowerCase())
      }
      onValueChange={(choice: Choice | null) => {
        if (choice !== null) props.onPick({ type: props.kind, id: choice.id });
      }}
    >
      {/* A combobox takes no name from its text, so the prompt names it and the text shows the pick. */}
      <ComboboxTrigger aria-label={copy.prompt}>
        {picked === null ? copy.prompt : labelOf(picked)}
      </ComboboxTrigger>
      <ComboboxContent>
        <div className="border-b border-border p-2">
          <ComboboxInput aria-label={copy.search} placeholder="Search" />
        </div>
        <ComboboxEmpty>{copy.empty}</ComboboxEmpty>
        <ComboboxList>
          {(choice: Choice) => (
            <ComboboxItem key={choice.id} value={choice}>
              {labelOf(choice)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
