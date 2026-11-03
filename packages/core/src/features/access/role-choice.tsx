"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@genie/ui";
import { type ReactNode, useId } from "react";

import type { GrantRole } from "../../services/roles/grants.ts";

/**
 * The role of one Granted row (R-37a, P3, P13). The roles arrive in choice order, the default
 * access role first. One role is plain text, because a select with one option offers no choice.
 */
export function RoleChoice(props: {
  /** Names the control "Role for <rowName>". */
  readonly rowName: string;
  readonly roles: readonly GrantRole[];
  readonly defaultRoleId: string | null;
  readonly value: string;
  /** Set when the staged role differs from the saved one. */
  readonly savedRoleId?: string;
  readonly disabledReason?: string;
  readonly onChange: (roleId: string) => void;
}): ReactNode {
  const reasonId = useId();

  const [only] = props.roles;

  if (props.roles.length === 1 && only !== undefined) {
    return <span className="text-sm">{only.name}</span>;
  }

  const items = props.roles.map((role) => ({
    value: role.id,
    label:
      role.id === props.defaultRoleId ? `${role.name} (default)` : role.name,
  }));

  const saved =
    props.savedRoleId === props.value
      ? undefined
      : props.roles.find((role) => role.id === props.savedRoleId);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {saved === undefined ? null : (
        <del className="text-xs text-muted-foreground">
          <span className="sr-only">Was </span>
          {saved.name}
        </del>
      )}
      <div className="w-56 max-w-full">
        <Select
          items={items}
          value={props.value}
          disabled={props.disabledReason !== undefined}
          onValueChange={(roleId: string | null) => {
            if (roleId !== null) props.onChange(roleId);
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label={`Role for ${props.rowName}`}
            aria-describedby={
              props.disabledReason === undefined ? undefined : reasonId
            }
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {props.disabledReason === undefined ? null : (
        <span id={reasonId} className="sr-only">
          {props.disabledReason}
        </span>
      )}
    </div>
  );
}
