"use client";

import { Button, FieldLabel, FieldTitle } from "@genie/ui";
import type { ReactNode } from "react";

import { OriginTag } from "./review-fields.tsx";
import type { ReviewItem } from "./review-model.ts";

/**
 * One field of a review: its label, its origin tag, its control, the value read once the person
 * changed it with Undo, and its note (czjw.98, prototype variant A card).
 */
export function ReviewCard(props: {
  readonly item: ReviewItem;
  /** "step" is the pager's: the label is an h2. */
  readonly size?: "card" | "step";
  readonly selected?: boolean;
  readonly hovered?: boolean;
}): ReactNode {
  const { item, size = "card" } = props;

  const label =
    item.controlId === null ? (
      <FieldTitle>{item.label}</FieldTitle>
    ) : (
      <FieldLabel htmlFor={item.controlId}>{item.label}</FieldLabel>
    );

  return (
    <div
      data-field={item.key}
      data-selected={props.selected === true ? "" : undefined}
      data-hovered={props.hovered === true ? "" : undefined}
      className={`flex flex-col gap-2 rounded-lg border bg-card px-3 py-2.5 shadow-xs data-hovered:border-ring/60 data-selected:border-ring data-selected:ring-2 data-selected:ring-ring/30 ${size === "step" ? "border-border p-4" : "border-border"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {size === "step" ? (
          <h2 className="text-base font-semibold">{label}</h2>
        ) : (
          label
        )}
        <OriginTag tag={item.tag} />
      </div>
      {item.control}
      {item.readAs === null ? null : (
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="min-w-0 break-words">Read as “{item.readAs}”</span>
          {item.onUndo === null ? null : (
            <Button
              type="button"
              variant="link"
              size="sm"
              aria-label={`Undo ${item.label}`}
              onClick={item.onUndo}
            >
              Undo
            </Button>
          )}
        </p>
      )}
      {item.note === null ? null : (
        <p className="text-xs text-muted-foreground">{item.note}</p>
      )}
    </div>
  );
}
