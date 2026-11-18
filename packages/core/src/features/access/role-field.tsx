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
  LabelPill,
} from "@genie/ui";
import type { ReactNode } from "react";

import type { RoleChoice, RoleChoiceGroup } from "./add-assignment-view.ts";

/** The shape Base UI reads as a grouped list. */
type Section = {
  readonly label: string;
  readonly moduleOff: boolean;
  readonly items: readonly RoleChoice[];
};

/** The searchable role list of the Add assignment form, grouped by module (prototype `rolePop`). */
export function RoleField(props: {
  readonly groups: readonly RoleChoiceGroup[];
  readonly value: RoleChoice | null;
  readonly onChange: (choice: RoleChoice) => void;
  readonly invalid?: boolean | undefined;
  readonly describedBy?: string | undefined;
}): ReactNode {
  const sections: readonly Section[] = props.groups.map((group) => ({
    label: group.label,
    moduleOff: group.moduleOff,
    items: group.choices,
  }));

  return (
    <Combobox<RoleChoice>
      items={sections}
      itemToStringLabel={(choice) => choice.name}
      isItemEqualToValue={(a, b) => a.roleId === b.roleId}
      value={props.value}
      onValueChange={(choice) => {
        if (choice !== null) props.onChange(choice);
      }}
    >
      <ComboboxTrigger
        aria-label="Role"
        aria-invalid={props.invalid === true ? true : undefined}
        aria-describedby={props.describedBy}
      >
        {props.value?.name ?? "Choose a role"}
      </ComboboxTrigger>
      <ComboboxContent aria-label="Roles">
        <div className="border-b border-border p-2">
          <ComboboxInput aria-label="Search roles" placeholder="Search roles" />
        </div>
        <ComboboxEmpty>No role matches.</ComboboxEmpty>
        <ComboboxList>
          {(section: Section) => (
            <ComboboxGroup key={section.label} items={section.items}>
              <ComboboxLabel>
                {section.label}
                {section.moduleOff ? (
                  <span className="ms-2 inline-flex font-normal tracking-normal normal-case">
                    <LabelPill>Module off</LabelPill>
                  </span>
                ) : null}
              </ComboboxLabel>
              <ComboboxCollection>
                {(choice: RoleChoice) => (
                  <ComboboxItem
                    key={choice.roleId}
                    value={choice}
                    disabled={choice.disabled}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="flex flex-wrap items-center gap-x-2">
                        {choice.name}
                        {choice.isDefault && !section.moduleOff ? (
                          <span className="text-muted-foreground">
                            (default)
                          </span>
                        ) : null}
                        {choice.custom ? (
                          <LabelPill>Custom role</LabelPill>
                        ) : null}
                      </span>
                      {choice.hint === null ? null : (
                        <span className="text-xs text-muted-foreground">
                          {choice.hint}
                        </span>
                      )}
                    </span>
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
