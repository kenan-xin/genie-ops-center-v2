"use client";

import {
  ConfirmDialog,
  DataTable,
  focusRing,
  HelpDisclosure,
  MonoChip,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusPill,
  Switch,
} from "@genie/ui";
import { useState } from "react";

import type { ModuleRefusal, ModulesScreenProps, ModuleView } from "./types.ts";

const linkClass = `text-sm font-medium text-foreground underline-offset-4 hover:underline ${focusRing}`;

function Identity({ module }: { readonly module: ModuleView }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>{module.displayName}</span>
      <MonoChip>{module.id}</MonoChip>
      {module.enabled ? null : <StatusPill tone="neutral">Off</StatusPill>}
    </span>
  );
}

/** The server's refusal under the switch: one line per issue and the way to fix them (R-84a). */
function Refusal(props: {
  readonly refusal: ModuleRefusal;
  readonly settingsHref: string;
}) {
  return (
    <div role="alert" className="grid gap-1 text-sm text-destructive">
      <p>{props.refusal.message}</p>
      {props.refusal.issues.length === 0 ? null : (
        <>
          <ul className="grid gap-0.5">
            {props.refusal.issues.map((issue, index) => (
              <li key={`${index}:${issue.path}`}>
                <code className="font-mono text-xs">{issue.path}</code>{" "}
                {issue.message}
              </li>
            ))}
          </ul>
          <a href={props.settingsHref} className={linkClass}>
            Fix in settings
          </a>
        </>
      )}
    </div>
  );
}

/**
 * Read-only: who holds a role carrying `<id>:use`. A switched-off module keeps them, muted (R-86).
 * Every change lives on the Roles screen the line links to, never here (R-85, DEC-39).
 */
function Access(props: {
  readonly module: ModuleView;
  readonly rolesHref: string;
}) {
  const { module } = props;

  return (
    <div
      className={`grid gap-1 text-sm ${module.enabled ? "" : "text-muted-foreground"}`}
    >
      {module.holders.length === 0 ? (
        <p className="text-muted-foreground">
          No one holds {module.displayName} yet
        </p>
      ) : (
        <ul
          aria-label={`Holders of ${module.displayName}`}
          className="grid gap-0.5"
        >
          {module.holders.map((holder) => (
            // A principal holding the key through two roles appears once per role.
            <li
              key={`${holder.principalType}:${holder.principalId}:${holder.roleName}`}
            >
              {holder.label}
              {holder.principalType === "group" ? " (group)" : ""}{" "}
              <span className="text-muted-foreground">· {holder.roleName}</span>
            </li>
          ))}
        </ul>
      )}
      <a href={props.rolesHref} className={linkClass}>
        Manage in Roles
        <span className="sr-only"> for {module.displayName}</span>
      </a>
    </div>
  );
}

export function ModulesScreen(props: ModulesScreenProps) {
  // The dialog keeps its module while closed, so its title does not blank during the exit.
  const [confirm, setConfirm] = useState<{
    readonly id: string;
    readonly open: boolean;
  }>({
    id: "",
    open: false,
  });

  const confirming = props.modules.find((module) => module.id === confirm.id);
  const setConfirmId = (id: string) => setConfirm({ id, open: true });

  const closeConfirm = () =>
    setConfirm((current) => ({ ...current, open: false }));

  const categoryItems = [
    { value: null, label: "No category" },
    ...props.categories.map((category) => ({
      value: category.id,
      label: category.name,
    })),
  ];

  // Switching on saves at once; switching off asks first (R-83).
  const enabledControl = (module: ModuleView) => (
    <div className="grid gap-2">
      <Switch
        aria-label={`${module.displayName} enabled`}
        checked={module.enabled}
        disabled={props.pending === module.id}
        onCheckedChange={(on) =>
          on ? props.onSwitch(module.id, true) : setConfirmId(module.id)
        }
      />
      {props.refusal?.moduleId === module.id ? (
        <Refusal refusal={props.refusal} settingsHref={props.settingsHref} />
      ) : null}
    </div>
  );

  // A module with no workspace entry has nothing to place in the navigation (R-84).
  const categoryPicker = (module: ModuleView) =>
    module.placeable ? (
      <Select
        items={categoryItems}
        value={module.categoryId}
        disabled={props.pending === module.id}
        onValueChange={(value) => props.onCategory(module.id, value)}
      >
        <SelectTrigger
          aria-label={`Category for ${module.displayName}`}
          className="w-48 max-w-full"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {categoryItems.map((item) => (
            <SelectItem key={item.value ?? ""} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : (
      <span className="text-xs text-muted-foreground">
        No workspace entry, so nothing to place
      </span>
    );

  const access = (module: ModuleView) => (
    <Access module={module} rolesHref={props.rolesHref} />
  );

  return (
    <div className="grid gap-4">
      <HelpDisclosure label="What a module is here">
        Every module compiled into this deployment is listed, on or off.
        Switching one off hides it and refuses its routes; its data stays.
        Access is read from role assignments, so nothing on this page grants it.
      </HelpDisclosure>

      {props.error !== undefined ? (
        <p role="alert" className="text-sm text-destructive">
          {props.error}
        </p>
      ) : props.loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading modules…
        </p>
      ) : (
        <DataTable
          label="Modules"
          rows={props.modules}
          rowKey={(module) => module.id}
          rowLabel={(module) => module.displayName}
          columns={[
            {
              id: "module",
              header: "Module",
              cell: (module) => <Identity module={module} />,
            },
            { id: "category", header: "Category", cell: categoryPicker },
            { id: "access", header: "Access", cell: access },
          ]}
          status={enabledControl}
          facts={(module) => [categoryPicker(module), access(module)]}
        />
      )}

      <ConfirmDialog
        open={confirm.open && confirming !== undefined}
        title={`Switch off ${confirming?.displayName ?? ""}?`}
        description={`Members lose ${confirming?.displayName ?? ""} from their navigation until it is switched on again. Its data stays.`}
        confirmLabel="Switch off"
        danger
        onConfirm={() => {
          if (confirming) props.onSwitch(confirming.id, false);
          closeConfirm();
        }}
        onClose={closeConfirm}
      />
    </div>
  );
}
