"use client";

import {
  Button,
  ConfirmDialog,
  DataTable,
  focusRing,
  HelpDisclosure,
  Input,
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
  Select,
  Spinner,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusPill,
  Switch,
} from "@genie/ui";
import { uniqBy } from "es-toolkit";
import { ChevronRightIcon } from "lucide-react";
import { Fragment, useId, useState, type ReactNode } from "react";

import { NoMatch } from "../admin/no-match.tsx";
import { GroupName } from "../groups/group-name.tsx";
import type {
  AccessLabels,
  ModuleHolderView,
  ModuleRefusal,
  ModulesScreenProps,
  ModuleView,
} from "./types.ts";

/** Holders the Access cell names; the rest become "+N" and the full list (DR-26). */
const NAMED = 3;

const linkClass = `text-sm font-medium text-foreground underline-offset-4 hover:underline ${focusRing}`;

/** The pill a switched-off module carries, in the table's cell and on the card. */
function offPill(module: ModuleView) {
  return module.enabled ? null : <StatusPill tone="neutral">Off</StatusPill>;
}

/** The id in quiet mono under the name, not a chip (fix list "Modules page on phones" (1)). */
function ModuleId({ module }: { readonly module: ModuleView }) {
  return (
    <span className="font-mono text-xs text-muted-foreground">{module.id}</span>
  );
}

/** One line with an ellipsis; the full text stays in the line and its title (fix list (2)). */
function Description({ module }: { readonly module: ModuleView }) {
  return module.description === null ? null : (
    <p
      title={module.description}
      className="truncate text-sm font-normal text-muted-foreground"
    >
      {module.description}
    </p>
  );
}

function Identity({ module }: { readonly module: ModuleView }) {
  return (
    <span className="grid max-w-sm min-w-0 gap-0.5">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>{module.displayName}</span>
        {offPill(module)}
      </span>
      <ModuleId module={module} />
      <Description module={module} />
    </span>
  );
}

/** The server's refusal under the switch: one line per issue and the way to fix them (R-84a). */
function Refusal(props: {
  readonly refusal: ModuleRefusal;
  readonly settingsHref: string;
}) {
  return (
    <div
      role="alert"
      className="grid gap-1 text-sm text-destructive dark:text-destructive-on-dark"
    >
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

function holderName(holder: ModuleHolderView, labels: AccessLabels) {
  return holder.principalType === "group" ? (
    <GroupName value={holder.label} format={labels.group} />
  ) : (
    holder.label
  );
}

/** The holders the summary names, groups first, each principal once; `hidden` is the rest. */
function namedHolders(module: ModuleView) {
  // A principal holding the key through two roles is named once.
  const principals = uniqBy(
    module.holders.toSorted(
      (a, b) =>
        Number(a.principalType === "user") - Number(b.principalType === "user")
    ),
    (holder) => `${holder.principalType}:${holder.principalId}`
  );

  return { principals, hidden: principals.length - NAMED };
}

function holderList(
  principals: readonly ModuleHolderView[],
  labels: AccessLabels
): ReactNode {
  return principals.slice(0, NAMED).map((holder, index) => (
    <Fragment key={`${holder.principalType}:${holder.principalId}`}>
      {index === 0 ? null : ", "}
      {holderName(holder, labels)}
    </Fragment>
  ));
}

/**
 * The phone row (fix list (4)): "Who can open it" over the holder summary, the whole row one link
 * to Roles and at least 44 px high. The full list lives on Roles: a button inside a link is invalid.
 */
function WhoCanOpen(props: {
  readonly module: ModuleView;
  readonly rolesHref: string;
  readonly labels: AccessLabels;
}) {
  const { module, labels } = props;
  const { principals, hidden } = namedHolders(module);

  return (
    // The negative margins take the band to the card's edges, as `modules-phone.png` draws it.
    <a
      href={props.rolesHref}
      className={`-mx-4 -mb-3 flex min-h-12 items-center gap-2 border-t border-border bg-muted/50 px-4 py-2 text-sm ${focusRing}`}
    >
      <span className="grid min-w-0 flex-1">
        <span className="text-xs font-semibold text-muted-foreground">
          {labels.whoCanOpen}
          <span className="sr-only">
            {" "}
            {labels.whoCanOpenFor(module.displayName)}
          </span>
        </span>
        <span
          className={`truncate ${module.enabled ? "text-foreground" : "text-muted-foreground"}`}
        >
          {principals.length === 0 ? (
            labels.nobody
          ) : (
            <>
              {holderList(principals, labels)}
              {hidden > 0 ? ` ${labels.more(hidden)}` : null}
            </>
          )}
        </span>
      </span>
      <span className="sr-only">{labels.manage}</span>
      <ChevronRightIcon
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground"
      />
    </a>
  );
}

/**
 * Read-only: who holds a role carrying `<id>:use`. A switched-off module keeps them, muted (R-86).
 * The cell names three, groups first, and "+N" opens the full list with each role (DR-26).
 * Every change lives on the Roles screen the line links to, never here (R-85, DEC-39).
 */
function Access(props: {
  readonly module: ModuleView;
  readonly rolesHref: string;
  readonly labels: AccessLabels;
}) {
  const { module, labels } = props;
  const { principals, hidden } = namedHolders(module);
  const name = (holder: ModuleHolderView) => holderName(holder, labels);

  return (
    <div
      className={`grid gap-1 text-sm ${module.enabled ? "" : "text-muted-foreground"}`}
    >
      {module.holders.length === 0 ? (
        <p className="text-muted-foreground">
          No one holds {module.displayName} yet
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2">
          <span>{holderList(principals, labels)}</span>
          {hidden > 0 ? (
            <Popover>
              <PopoverTrigger
                render={<Button variant="ghost" size="lg" />}
                aria-label={labels.showAll(hidden, module.displayName)}
              >
                {labels.more(hidden)}
              </PopoverTrigger>
              <PopoverContent align="start">
                <PopoverTitle>{labels.title(module.displayName)}</PopoverTitle>
                <ul className="grid max-h-72 gap-0.5 overflow-y-auto">
                  {module.holders.map((holder) => (
                    // A principal holding the key through two roles appears once per role.
                    <li
                      key={`${holder.principalType}:${holder.principalId}:${holder.roleName}`}
                    >
                      {name(holder)}{" "}
                      <span className="text-muted-foreground">
                        · {holder.roleName}
                      </span>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
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

  const searchId = useId();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const shown = props.modules.filter((module) =>
    [module.displayName, module.id].some((text) =>
      text.toLowerCase().includes(needle)
    )
  );

  const categoryItems = [
    { value: null, label: "No category" },
    ...props.categories.map((category) => ({
      value: category.id,
      label: category.name,
    })),
  ];

  // Switching on saves at once; switching off asks first (R-83).
  const enabledSwitch = (module: ModuleView) => (
    // A switch has no loading state, so a spinner sits beside it while its call runs.
    <span className="flex items-center gap-2">
      {props.pending === module.id ? (
        <Spinner label={props.accessLabels.saving(module.displayName)} />
      ) : null}
      <Switch
        aria-label={`${module.displayName} on`}
        aria-busy={props.pending === module.id || undefined}
        checked={module.enabled}
        disabled={props.pending === module.id}
        onCheckedChange={(on) =>
          on ? props.onSwitch(module.id, true) : setConfirmId(module.id)
        }
      />
    </span>
  );

  const refusal = (module: ModuleView) =>
    props.refusal?.moduleId === module.id ? (
      <Refusal refusal={props.refusal} settingsHref={props.settingsHref} />
    ) : null;

  const enabledControl = (module: ModuleView) => (
    <div className="grid gap-2">
      {enabledSwitch(module)}
      {refusal(module)}
    </div>
  );

  // A module with no workspace entry has nothing to place in the navigation (R-84).
  const categoryPicker = (module: ModuleView, fullWidth = false) =>
    module.placeable ? (
      <Select
        items={categoryItems}
        value={module.categoryId}
        disabled={props.pending === module.id}
        onValueChange={(value) => props.onCategory(module.id, value)}
      >
        <SelectTrigger
          aria-label={`Category for ${module.displayName}`}
          className={fullWidth ? "w-full" : "w-48 max-w-full"}
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
    <Access
      module={module}
      rolesHref={props.rolesHref}
      labels={props.accessLabels}
    />
  );

  return (
    <div className="grid gap-4">
      {/* One row on every width: the search, then the icon-only help (fix list (5)). */}
      <div className="flex w-full min-w-0 items-center gap-2">
        <label htmlFor={searchId} className="sr-only">
          {props.searchLabel}
        </label>
        <Input
          id={searchId}
          className="min-w-0 flex-1 sm:w-72 sm:flex-none"
          placeholder={props.searchLabel}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <HelpDisclosure label="What a module is here" iconOnly>
          Every module compiled into this deployment is listed, on or off.
          Switching one off hides it and refuses its routes; its data stays.
          Access is read from role assignments, so nothing on this page grants
          it.
        </HelpDisclosure>
      </div>

      {props.error !== undefined ? (
        <p
          role="alert"
          className="text-sm text-destructive dark:text-destructive-on-dark"
        >
          {props.error}
        </p>
      ) : props.loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading modules…
        </p>
      ) : shown.length === 0 && needle !== "" ? (
        <NoMatch copy={props.noMatch} onClear={() => setQuery("")} />
      ) : (
        <DataTable
          label="Modules"
          rows={shown}
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
          // The approved phone card (`modules-phone.png`): no tile, the switch on the name's line.
          card={{
            title: (module) => (
              <span
                className={`text-base font-semibold ${module.enabled ? "" : "text-muted-foreground"}`}
              >
                {module.displayName}
              </span>
            ),
            badge: (module) => offPill(module),
            trailing: enabledSwitch,
            detail: (module) => <ModuleId module={module} />,
            content: (module) => (
              <div className="grid gap-3">
                <Description module={module} />
                {refusal(module)}
                <div className="grid gap-1.5">
                  {/* The trigger carries its own name; this label is the visible heading. */}
                  <span
                    aria-hidden="true"
                    className="text-xs font-semibold text-muted-foreground"
                  >
                    {props.accessLabels.category}
                  </span>
                  {categoryPicker(module, true)}
                </div>
                <WhoCanOpen
                  module={module}
                  rolesHref={props.rolesHref}
                  labels={props.accessLabels}
                />
              </div>
            ),
          }}
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
