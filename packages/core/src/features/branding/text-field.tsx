"use client";

import { FieldDescription, FieldError, FieldLabel, Input } from "@genie/ui";

/** One labelled text input with its hint and its error, wired by id for a screen reader. */
export function TextField(props: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string | undefined;
  readonly description?: string;
}) {
  const describedBy =
    props.error === undefined ? undefined : `${props.id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
      <Input
        id={props.id}
        value={props.value}
        aria-invalid={props.error !== undefined}
        aria-describedby={describedBy}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.error === undefined ? (
        props.description === undefined ? null : (
          <FieldDescription>{props.description}</FieldDescription>
        )
      ) : (
        <FieldError id={describedBy}>{props.error}</FieldError>
      )}
    </div>
  );
}
