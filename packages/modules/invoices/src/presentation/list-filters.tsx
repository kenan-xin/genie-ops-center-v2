"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  Field,
  FieldLabel,
  FilterDisclosure,
  DateRangePicker,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@genie/ui";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import { SearchIcon } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";

import type { ListCustomer } from "./views.ts";

/**
 * The filter bar of a list (design review 1.4): the search, then the filters inline from 768 px.
 * Below that the filters fold into one Filters button, so the cards start near the top.
 * `filters` renders once per place, so each copy keeps its own ids.
 */
export function ListFilterBar(props: {
  readonly searchLabel: string;
  readonly search: string | undefined;
  readonly onSearch: (value: string | undefined) => void;
  /** The filters set, not counting the search. */
  readonly count: number;
  readonly onClear: () => void;
  readonly filters: () => ReactNode;
}) {
  const [text, setText] = useState(props.search ?? "");
  const search = useDebouncedCallback(props.onSearch, { wait: 300 });

  // Follow a search the address changed, such as Back or a shared link.
  useEffect(() => {
    setText((current) =>
      current.trim() === (props.search ?? "") ? current : (props.search ?? "")
    );
  }, [props.search]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <InputGroup className="min-w-0 flex-1 md:max-w-sm">
          <InputGroupInput
            type="search"
            value={text}
            aria-label={props.searchLabel}
            placeholder={props.searchLabel}
            onChange={(event) => {
              setText(event.target.value);
              search(event.target.value.trim() || undefined);
            }}
          />
          <InputGroupAddon>
            <InputGroupText>
              <SearchIcon aria-hidden="true" />
            </InputGroupText>
          </InputGroupAddon>
        </InputGroup>
        <span className="inline-flex shrink-0 md:hidden">
          <FilterDisclosure count={props.count} onClear={props.onClear}>
            {props.filters()}
          </FilterDisclosure>
        </span>
      </div>
      <div className="hidden md:flex md:flex-wrap md:items-end md:gap-4">
        {props.filters()}
      </div>
    </div>
  );
}

type CustomerItem = { readonly value: string; readonly label: string };

/** The customer picker: a search over the customers the person may read; empty means all. */
export function CustomerFilter(props: {
  readonly customers: readonly ListCustomer[];
  readonly value: string | undefined;
  readonly onChange: (customerId: string | undefined) => void;
}) {
  const id = useId();

  const items: readonly CustomerItem[] = props.customers.map((customer) => ({
    value: customer.id,
    label: customer.name,
  }));

  const selected = items.find((item) => item.value === props.value) ?? null;

  return (
    <Field className="md:w-56">
      <FieldLabel htmlFor={id}>Customer</FieldLabel>
      <Combobox<CustomerItem>
        items={items}
        value={selected}
        onValueChange={(item) => {
          if (!Array.isArray(item)) props.onChange(item?.value);
        }}
        onInputValueChange={(text, details) => {
          if (details.reason === "input-change" && text.trim() === "") {
            props.onChange(undefined);
          }
        }}
      >
        <ComboboxInput id={id} placeholder="All customers" />
        <ComboboxContent>
          <ComboboxEmpty>No customer matches.</ComboboxEmpty>
          <ComboboxList>
            {(item: CustomerItem) => (
              <ComboboxItem key={item.value} value={item}>
                {item.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  );
}

/** A date range as one range picker (owner I8, list filter prototype C); each pick applies. */
export function DateRangeFilter(props: {
  readonly label: string;
  readonly from: string | undefined;
  readonly to: string | undefined;
  readonly onChange: (range: {
    readonly from: string | undefined;
    readonly to: string | undefined;
  }) => void;
}) {
  const id = useId();

  return (
    <Field className="md:w-64">
      <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
      <DateRangePicker
        id={id}
        label={props.label}
        placeholder={`Any ${props.label.toLowerCase()}`}
        value={{ from: props.from, to: props.to }}
        onChange={(next) => props.onChange({ from: next.from, to: next.to })}
      />
    </Field>
  );
}
