"use client";

import { Badge, Button } from "@genie/ui";
import { LocateFixedIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { ReadingField, StoredReading } from "../contract.ts";
import { centsOf } from "../services/reading/quote-check.ts";
import {
  reviewedOrigins,
  type ReviewedFields,
} from "../services/reading/reviewed-origins.ts";
import type { DocumentKind } from "./document-kind.ts";
import type { ViewerHighlight } from "./document-viewer.tsx";
import { formatDay, formatMoney } from "./format.ts";
import type { DocumentReviewView } from "./views.ts";

export type ReviewFieldKey = ReadingField | "invoiceNumbers";

export type OriginTagKind =
  | "extracted"
  | "entered"
  | "corrected"
  | "check-this"
  | "not-on-document";

/** The rows of one document type, in the order the review shows them (R-27, R-38). */
export const FIELDS_OF = {
  "invoice": [
    { field: "customer", label: "Customer" },
    { field: "number", label: "Invoice number" },
    { field: "date", label: "Invoice date" },
    { field: "amount", label: "Total" },
    { field: "currency", label: "Currency" },
    { field: "dueDate", label: "Due date" },
    { field: "paymentTerms", label: "Payment terms" },
    { field: "description", label: "Description" },
  ],
  "paid-receipt": [
    { field: "customer", label: "Customer" },
    { field: "number", label: "Receipt number" },
    { field: "date", label: "Date" },
    { field: "amount", label: "Total" },
    { field: "currency", label: "Currency" },
    { field: "dueDate", label: "Due date" },
    { field: "reference", label: "Reference" },
    { field: "method", label: "Method" },
    { field: "description", label: "Description" },
  ],
  "payment": [
    { field: "customer", label: "Customer" },
    { field: "date", label: "Payment date" },
    { field: "amount", label: "Amount" },
    { field: "currency", label: "Currency" },
    { field: "reference", label: "Reference" },
    { field: "method", label: "Method" },
    { field: "invoiceNumbers", label: "Invoice numbers" },
  ],
  "purchase-order": [
    { field: "customer", label: "Customer" },
    { field: "number", label: "Order number" },
    { field: "date", label: "Order date" },
    { field: "amount", label: "Total" },
    { field: "currency", label: "Currency" },
  ],
} as const satisfies Readonly<
  Record<
    DocumentKind,
    readonly { readonly field: ReviewFieldKey; readonly label: string }[]
  >
>;

/** The tag a field has before any edit: extracted, check-this (in `dropped`) or not-on-document. */
export function readOriginOf(
  reading: StoredReading | null,
  field: ReviewFieldKey
): OriginTagKind {
  if (reading === null) return "not-on-document";

  if (reading.dropped.includes(field)) return "check-this";

  if (field === "invoiceNumbers") {
    return reading.invoiceNumbers.length > 0 ? "extracted" : "not-on-document";
  }

  return reading.fields[field] === undefined ? "not-on-document" : "extracted";
}

/** A value that is one text, rather than a list of invoice numbers. */
function isText(
  value: string | readonly string[] | null
): value is string | null {
  return value === null || !Array.isArray(value);
}

/**
 * The tag a field shows now: its stored origin, or the origin that the save will store (czjw.27,
 * decision 8). `corrected` and `entered` win; otherwise the stored origin applies.
 */
export function liveTagOf(
  reading: StoredReading | null,
  field: ReviewFieldKey,
  value: string | readonly string[] | null
): OriginTagKind {
  const filled = isText(value)
    ? value !== null && value.trim() !== ""
    : value.length > 0;

  if (reading === null) return filled ? "entered" : "not-on-document";

  if (field === "invoiceNumbers") {
    const invoiceNumbers = Array.isArray(value) ? value : [];

    return (
      reviewedOrigins(reading, { invoiceNumbers }).get(field) ??
      readOriginOf(reading, field)
    );
  }

  const reviewed: ReviewedFields = {
    [field]: Array.isArray(value) ? null : value,
  };

  return (
    reviewedOrigins(reading, reviewed).get(field) ??
    readOriginOf(reading, field)
  );
}

/** Where a field's value was read: its quote and page, else nothing. */
export function sourcesOf(
  reading: StoredReading | null,
  field: ReviewFieldKey
): readonly ViewerHighlight[] {
  if (reading === null) return [];

  if (field === "invoiceNumbers") {
    return reading.invoiceNumbers.map(({ page, quote }) => ({ page, quote }));
  }

  const quoted = reading.fields[field];

  return quoted === undefined
    ? []
    : [{ page: quoted.page, quote: quoted.quote }];
}

/** The origin of a stored value, in the words of the design (R-25, decision 12). */
export function OriginTag(props: { readonly tag: OriginTagKind }): ReactNode {
  switch (props.tag) {
    case "extracted":
      return <Badge variant="label">Extracted</Badge>;
    case "entered":
      return <Badge variant="label">Entered by you</Badge>;
    case "corrected":
      return <Badge variant="label">Corrected by you</Badge>;
    case "check-this":
      return <Badge variant="warning">Check this</Badge>;
    case "not-on-document":
      return <Badge variant="neutral">Unspecified</Badge>;
  }
}

/** The value a read-only row shows, formatted for its type (R-36). */
function valueText(
  reading: StoredReading | null,
  field: ReviewFieldKey
): string {
  if (reading === null) return "Not on the document";

  if (field === "invoiceNumbers") {
    const numbers = reading.invoiceNumbers.map(({ value }) => value);

    return numbers.length === 0 ? "Not on the document" : numbers.join(", ");
  }

  const quoted = reading.fields[field];

  if (quoted === undefined) return "Not on the document";

  if (field === "amount") {
    const cents = centsOf(quoted.value);
    const currency = reading.fields.currency?.value;

    return cents === undefined || currency === undefined
      ? quoted.value
      : formatMoney(cents, currency);
  }

  if (field === "date" || field === "dueDate") return formatDay(quoted.value);

  return quoted.value;
}

/** The one source line under the selected row, or one line per source. */
function SourceLines(props: {
  readonly tag: OriginTagKind;
  readonly sources: readonly ViewerHighlight[];
  readonly unread: boolean;
}): ReactNode {
  if (props.unread) {
    return <p>The document was not read. Fill in this field by hand.</p>;
  }

  switch (props.tag) {
    case "check-this":
      return (
        <p>
          The value read here is not in the document text, so it was left out.
        </p>
      );
    case "not-on-document":
      return (
        <p>
          Not on the document. Left blank; the system does not invent values.
        </p>
      );
    default:
      return props.sources.map((source) => (
        <p key={`${source.page} ${source.quote}`}>
          {`Found on page ${source.page}, highlighted on the document: “${source.quote}”`}
        </p>
      ));
  }
}

export type ReviewFieldRowProps = {
  readonly field: ReviewFieldKey;
  readonly label: string;
  readonly tag: OriginTagKind;
  readonly sources: readonly ViewerHighlight[];
  /** True when the document has no stored reading (AI off, no text layer). */
  readonly unread: boolean;
  readonly selected: boolean;
  readonly onSelect: () => void;
  /** The value as shown, or the control that edits it (Tasks 5 and 6). */
  readonly children: ReactNode;
};

/** One field: its label, its value or control, its tag, and its source when selected (R-38). */
export function ReviewFieldRow(props: ReviewFieldRowProps): ReactNode {
  const { field, label, tag, sources, unread, selected, onSelect, children } =
    props;

  // Selecting collapses the source line of the row selected before, which moves this row. On a
  // pointer press that move would happen between mousedown and mouseup and lose the click, so a
  // pointer selects on click; keyboard focus matches :focus-visible and selects at once (Task 4).
  return (
    <div
      data-field={field}
      className={`flex flex-col gap-1 px-4 py-3 ${selected ? "bg-muted" : ""}`}
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) onSelect();
      }}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        <span className="w-32 shrink-0 text-sm text-muted-foreground">
          {label}
        </span>
        <div className="min-w-0 flex-1 text-sm font-medium">{children}</div>
        <span className="flex shrink-0 items-center gap-2">
          <OriginTag tag={tag} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Show ${label} on the document`}
            title="Show on the document"
            aria-pressed={selected}
            onClick={onSelect}
          >
            <LocateFixedIcon aria-hidden strokeWidth={1.75} />
          </Button>
        </span>
      </div>
      {selected ? (
        <div className="pl-32 text-xs text-muted-foreground">
          <SourceLines tag={tag} sources={sources} unread={unread} />
        </div>
      ) : null}
    </div>
  );
}

/** The read-only rows of a document (R-38). */
export function ReviewFieldList(props: {
  readonly view: DocumentReviewView;
  readonly kind: DocumentKind;
  readonly selected: ReviewFieldKey | null;
  readonly onSelect: (field: ReviewFieldKey) => void;
}): ReactNode {
  const { view, kind, selected, onSelect } = props;
  const { reading } = view;

  return (
    <div className="flex flex-col divide-y divide-border">
      {FIELDS_OF[kind].map(({ field, label }) => (
        <ReviewFieldRow
          key={field}
          field={field}
          label={label}
          tag={readOriginOf(reading, field)}
          sources={sourcesOf(reading, field)}
          unread={reading === null}
          selected={selected === field}
          onSelect={() => onSelect(field)}
        >
          {valueText(reading, field)}
        </ReviewFieldRow>
      ))}
    </div>
  );
}
