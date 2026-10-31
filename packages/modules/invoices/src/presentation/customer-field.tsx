"use client";

import {
  Checkbox,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  FieldLabel,
} from "@genie/ui";
import type { ReactNode } from "react";

import type { SaveInvoiceInput } from "../contract.ts";
import type { DocumentReviewView } from "./views.ts";

/** The review's customer: one the deployment stores, a new one not yet confirmed, or none. */
export type CustomerValue =
  | { readonly kind: "existing"; readonly id: string; readonly name: string }
  | { readonly kind: "new"; readonly name: string; readonly confirmed: boolean }
  | { readonly kind: "none" };

/** The customer the review starts with: the match, else the name the reading held (R-33). */
export function initialCustomer(view: DocumentReviewView): CustomerValue {
  if (view.customerMatch !== null) {
    return {
      kind: "existing",
      id: view.customerMatch.id,
      name: view.customerMatch.name,
    };
  }

  const name = view.reading?.fields.customer?.value.trim() ?? "";

  return name === ""
    ? { kind: "none" }
    : { kind: "new", name, confirmed: false };
}

/** The save's customer, or undefined while a new customer is unconfirmed or none is chosen. */
export function customerChoiceOf(
  value: CustomerValue
): SaveInvoiceInput["customer"] | undefined {
  if (value.kind === "existing") return { id: value.id };

  if (value.kind === "new" && value.confirmed) {
    return { name: value.name.trim(), email: null, confirmed: true };
  }

  return undefined;
}

type Customer = DocumentReviewView["customers"][number];

type CustomerItem = { readonly value: string; readonly label: string };

/** The customer picker: a search over the stored customers, and the confirmation of a new one. */
export function CustomerField(props: {
  readonly customers: DocumentReviewView["customers"];
  readonly value: CustomerValue;
  readonly onChange: (value: CustomerValue) => void;
}): ReactNode {
  const { customers, value, onChange } = props;

  const items: readonly CustomerItem[] = customers.map((customer) => ({
    value: customer.id,
    label: customer.name,
  }));

  const selected =
    value.kind === "existing"
      ? (items.find((item) => item.value === value.id) ?? null)
      : null;

  const typed = value.kind === "new" ? value.name.trim() : "";

  const matchesStored = customers.some(
    (customer) => customer.name.trim().toLowerCase() === typed.toLowerCase()
  );

  const showCreate = value.kind === "new" && typed !== "" && !matchesStored;

  return (
    <div className="flex flex-col gap-2">
      <Combobox<CustomerItem>
        items={items}
        value={selected}
        inputValue={value.kind === "none" ? "" : value.name}
        onInputValueChange={(text, details) => {
          if (details.reason !== "input-change") return;

          const name = text.trim();

          if (name === "") {
            onChange({ kind: "none" });

            return;
          }

          const match: Customer | undefined = customers.find(
            (customer) =>
              customer.name.trim().toLowerCase() === name.toLowerCase()
          );

          onChange(
            match === undefined
              ? { kind: "new", name: text, confirmed: false }
              : { kind: "existing", id: match.id, name: match.name }
          );
        }}
        onValueChange={(item) => {
          if (item !== null && !Array.isArray(item)) {
            onChange({ kind: "existing", id: item.value, name: item.label });
          }
        }}
      >
        <ComboboxInput
          id="review-customer"
          aria-label="Customer"
          placeholder="Search customers"
        />
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
      {showCreate ? (
        <FieldLabel className="items-center">
          <Checkbox
            checked={value.kind === "new" && value.confirmed}
            onCheckedChange={(checked) => {
              if (value.kind === "new") {
                onChange({
                  kind: "new",
                  name: value.name,
                  confirmed: checked,
                });
              }
            }}
          />
          <span className="ml-2">{`Create ${typed} as a new customer`}</span>
        </FieldLabel>
      ) : null}
    </div>
  );
}
