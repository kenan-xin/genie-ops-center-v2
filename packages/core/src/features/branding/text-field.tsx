"use client";

import {
  FieldDescription,
  FieldError,
  FieldLabel,
  focusRing,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  touchAreas,
} from "@genie/ui";
import type { ChangeEvent } from "react";

/**
 * One labelled text input with its hint and its error, wired by id for a screen reader. A color
 * field carries its swatch inside the field box, before the hex value (ADM-19).
 */
export function TextField(props: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string | undefined;
  readonly description?: string;
  readonly swatch?: { readonly label: string; readonly value: string };
}) {
  const describedBy =
    props.error === undefined ? undefined : `${props.id}-error`;

  const field = {
    "id": props.id,
    "value": props.value,
    "aria-invalid": props.error !== undefined,
    "aria-describedby": describedBy,
    "onChange": (event: ChangeEvent<HTMLInputElement>) =>
      props.onChange(event.target.value),
  };

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
      {props.swatch === undefined ? (
        <Input {...field} />
      ) : (
        <InputGroup>
          <InputGroupAddon>
            <label className={`flex cursor-pointer ${touchAreas.md}`}>
              <input
                type="color"
                aria-label={props.swatch.label}
                value={props.swatch.value}
                className={`size-6 cursor-pointer rounded-sm border-0 bg-transparent p-0 [&::-moz-color-swatch]:rounded-sm [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 ${focusRing}`}
                onChange={(event) => props.onChange(event.target.value)}
              />
            </label>
          </InputGroupAddon>
          <InputGroupInput {...field} />
        </InputGroup>
      )}
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
