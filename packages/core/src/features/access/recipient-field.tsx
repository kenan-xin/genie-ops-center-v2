"use client";

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
  iconLead,
} from "@genie/ui";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import { CheckIcon, UsersIcon } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";

import type {
  RecipientPage,
  RecipientRow,
} from "../../services/roles/recipients.ts";
import { recipientDetail } from "./assignment-words.ts";
import { RecipientMark } from "./recipient-mark.tsx";

export type RecipientFieldProps = {
  /** "Assign to", "Person or group" or "Grant to": the accessible name. */
  readonly label: string;
  /** The text with no pick: "Anyone" (filter) or "Search people and groups" (field). */
  readonly placeholder: string;
  readonly multiple: boolean;
  /** The picks; at most one when `multiple` is false. */
  readonly value: readonly RecipientRow[];
  readonly onChange: (next: readonly RecipientRow[]) => void;
  /** One page of matches and the total: the host calls `roles.recipients` with `limit: 10`. */
  readonly search: (query: string) => Promise<RecipientPage>;
  /** The viewer's own person id: listed, disabled, with the self line (P12-3). */
  readonly selfId?: string | undefined;
  /** "filter" draws the filter bar trigger: label muted, value semibold, tinted when set (czjw.102). */
  readonly look?: "field" | "filter" | undefined;
  readonly invalid?: boolean | undefined;
  readonly describedBy?: string | undefined;
};

const SELF_LINE = "Only another administrator can change your own access.";

const counts = new Intl.NumberFormat("en-GB");

type Section = {
  readonly label: "Groups" | "People";
  readonly items: readonly RecipientRow[];
};

const keyOf = (row: RecipientRow) => `${row.type}:${row.id}`;

/** Groups first, as the read returns them; a section with no row is left out. */
function sectionsOf(rows: readonly RecipientRow[]): readonly Section[] {
  const groups = rows.filter((row) => row.type === "group");
  const people = rows.filter((row) => row.type === "user");
  const sections: Section[] = [];

  if (groups.length > 0) sections.push({ label: "Groups", items: groups });

  if (people.length > 0) sections.push({ label: "People", items: people });

  return sections;
}

/** One type-ahead field that picks one or many people and groups from the host's server read. */
export function RecipientField(props: RecipientFieldProps): ReactNode {
  const [page, setPage] = useState<RecipientPage | null>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef(0);
  const chips = useRef<HTMLDivElement | null>(null);

  // Only the newest call may set the list: a slow answer to an older query is dropped.
  const run = (query: string) => {
    const call = ++latest.current;

    props.search(query).then(
      (next) => {
        if (call === latest.current) {
          setPage(next);
          setFailed(false);
        }
      },
      () => {
        if (call === latest.current) {
          setPage(null);
          setFailed(true);
        }
      }
    );
  };

  const debounced = useDebouncedCallback(run, { wait: 300 });

  const sections = sectionsOf(page?.rows ?? []);
  const picked = new Set(props.value.map(keyOf));

  const optionOf = (row: RecipientRow) => {
    const self = row.type === "user" && row.id === props.selfId;
    const key = keyOf(row);

    return (
      <ComboboxItem
        key={key}
        value={row}
        disabled={self}
        className="items-start"
      >
        <RecipientMark type={row.type} name={row.name} />
        {/* 8 px down, so the 32 px mark's center sits on the first line's center (6wz1.113). */}
        <span className="flex min-w-0 flex-1 flex-col pt-2">
          <span className="truncate">
            {self ? `${row.name} (you)` : row.name}
          </span>
          <span
            className={
              self
                ? "text-xs text-muted-foreground"
                : "truncate text-xs text-muted-foreground"
            }
          >
            {self ? SELF_LINE : recipientDetail(row)}
          </span>
        </span>
        {picked.has(key) ? (
          <CheckIcon
            aria-hidden="true"
            // The name's 8 px padding, so the check centers on the name's line (C12-4).
            className="mt-2 size-4 shrink-0 text-primary"
          />
        ) : null}
      </ComboboxItem>
    );
  };

  const list = (
    <ComboboxList>
      {(section: Section) => (
        <ComboboxGroup key={section.label} items={section.items}>
          <ComboboxLabel>{section.label}</ComboboxLabel>
          <ComboboxCollection>
            {(row: RecipientRow) => optionOf(row)}
          </ComboboxCollection>
        </ComboboxGroup>
      )}
    </ComboboxList>
  );

  const empty = (
    <ComboboxEmpty>
      {page !== null && !failed ? "No group or person matches." : null}
    </ComboboxEmpty>
  );

  const end = (
    <>
      {failed ? (
        <p role="alert" className="px-3 py-2 text-sm text-destructive">
          People and groups did not load. Try again.
        </p>
      ) : null}
      {page !== null && page.total > page.rows.length ? (
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground tabular-nums">
          {`Showing ${page.rows.length} of ${counts.format(page.total)}. Type to search.`}
        </p>
      ) : null}
    </>
  );

  const shared = {
    items: sections,
    filter: null,
    itemToStringLabel: (row: RecipientRow) => row.name,
    isItemEqualToValue: (a: RecipientRow, b: RecipientRow) =>
      keyOf(a) === keyOf(b),
    onOpenChange: (open: boolean) => {
      if (open) run("");
    },
    onInputValueChange: (query: string) => debounced(query),
  };

  if (props.multiple) {
    return (
      <Combobox<RecipientRow, true>
        multiple
        {...shared}
        value={[...props.value]}
        onValueChange={(next) => props.onChange(next)}
      >
        <ComboboxChips ref={chips}>
          {props.value.map((row) => (
            <ComboboxChip key={keyOf(row)} removeLabel={`Remove ${row.name}`}>
              {row.type === "group" ? (
                <UsersIcon
                  aria-hidden="true"
                  className={`size-4 text-muted-foreground ${iconLead}`}
                />
              ) : null}
              {row.name}
            </ComboboxChip>
          ))}
          <ComboboxChipsInput
            aria-label={props.label}
            placeholder={
              props.value.length > 0 ? "Add more" : props.placeholder
            }
            aria-invalid={props.invalid === true ? true : undefined}
            aria-describedby={props.describedBy}
          />
        </ComboboxChips>
        <ComboboxContent anchor={chips}>
          {empty}
          {list}
          {end}
        </ComboboxContent>
      </Combobox>
    );
  }

  const one = props.value[0] ?? null;

  return (
    <Combobox<RecipientRow>
      {...shared}
      value={one}
      onValueChange={(row) => props.onChange(row === null ? [] : [row])}
    >
      <ComboboxTrigger
        aria-label={props.label}
        aria-invalid={props.invalid === true ? true : undefined}
        aria-describedby={props.describedBy}
        variant={
          props.look === "filter"
            ? one === null
              ? "filter"
              : "filter-set"
            : "default"
        }
      >
        {props.look === "filter" ? (
          <>
            <span className="font-normal text-muted-foreground">
              {props.label}
            </span>{" "}
            <span className="font-semibold">
              {one?.name ?? props.placeholder}
            </span>
          </>
        ) : (
          (one?.name ?? props.placeholder)
        )}
      </ComboboxTrigger>
      <ComboboxContent aria-label={props.label}>
        <div className="border-b border-border p-2">
          <ComboboxInput
            aria-label="Search people and groups"
            placeholder="Search"
          />
        </div>
        {empty}
        {list}
        {end}
      </ComboboxContent>
    </Combobox>
  );
}
