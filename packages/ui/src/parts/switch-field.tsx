"use client";

import { useId } from "react";

import { Switch } from "../components/switch.tsx";
import { rowHeight } from "../theme/tokens.ts";

export type SwitchFieldProps = {
  readonly label: string;
  readonly description?: string;
  readonly checked?: boolean;
  readonly defaultChecked?: boolean;
  readonly onCheckedChange?: (checked: boolean) => void;
  readonly disabled?: boolean;
};

/** The labelled switch row: the `<label>` names the switch and toggles it. */
export function SwitchField({
  label,
  description,
  onCheckedChange,
  ...state
}: SwitchFieldProps) {
  const labelId = useId();
  const descriptionId = useId();

  return (
    <label
      className={`flex ${rowHeight} items-center justify-between gap-4 text-foreground`}
    >
      <span className="flex flex-col">
        <span id={labelId} className="text-sm font-medium">
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className="text-sm text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      <Switch
        {...state}
        // aria-labelledby keeps the description out of the name the row label would give.
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        onCheckedChange={
          onCheckedChange ? (checked) => onCheckedChange(checked) : undefined
        }
      />
    </label>
  );
}
