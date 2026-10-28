"use client";

import { CountPill, focusRing } from "@genie/ui";
import {
  Blocks,
  Box,
  ChevronDown,
  Palette,
  ScrollText,
  Settings,
  ShieldCheck,
  Tags,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";

import { activeHref } from "./active-link.ts";
import { readCollapsed, writeCollapsed } from "./collapsed-categories.ts";
import { linkFor } from "./shell-link.ts";
import type {
  ShellCategory,
  ShellChrome,
  ShellLink,
  ShellLinkComponent,
  ShellNavigation,
  ShellStrings,
} from "./types.ts";

export type NavigationRailProps = {
  readonly chrome: ShellChrome;
  readonly navigation: ShellNavigation;
  readonly currentPath: string;
  readonly strings: Pick<ShellStrings, "workspace" | "pinned" | "categories">;
  readonly linkComponent?: ShellLinkComponent | undefined;
};

// Roles is ShieldCheck, not Shield: the admin capture draws the check.
const CORE_ICONS = new Map<string, LucideIcon>([
  ["core-people", Users],
  ["core-groups", UsersRound],
  ["core-roles", ShieldCheck],
  ["core-branding", Palette],
  ["core-settings", Settings],
  ["core-audit", ScrollText],
  ["core-modules", Blocks],
  ["core-categories", Tags],
]);

// Rows are 44px under lg (touch targets), then 40px nav rows and 32px tree rows.
const rowBase = `flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm motion-safe:transition-colors lg:min-h-0 ${focusRing}`;

const navRow = "lg:h-10";

const treeRow = "lg:h-8";

const rowIdle = "font-medium text-foreground hover:bg-border/60";

// An entry under a category is one step quieter than a top-level row.
const rowChild =
  "font-medium text-muted-foreground hover:bg-border/60 hover:text-foreground";

// A filled row, not a hairline: in dark the card is the panel's own color, so the fill steps up.
const rowActive =
  "bg-card font-semibold text-primary ring-1 ring-border dark:bg-border dark:text-brand-on-dark dark:ring-muted-foreground/30";

function deviceStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function Caption(props: { readonly children: ReactNode }) {
  return (
    <div className="px-3 pt-5 pb-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
      {props.children}
    </div>
  );
}

function Row(props: {
  readonly link: ShellLink;
  readonly active: string | undefined;
  readonly height: string;
  readonly idle?: string;
  /** A module's entry brings no icon; nav rows give it this one, so labels start in one column. */
  readonly defaultIcon?: LucideIcon;
  readonly linkComponent: ShellLinkComponent | undefined;
}) {
  const isActive = props.link.href === props.active;
  const Icon = CORE_ICONS.get(props.link.id) ?? props.defaultIcon;
  const Anchor = linkFor(props.link.href, props.linkComponent);

  return (
    <Anchor
      href={props.link.href}
      title={props.link.label}
      aria-current={isActive ? "page" : undefined}
      className={`${rowBase} ${props.height} ${isActive ? rowActive : (props.idle ?? rowIdle)}`}
    >
      {Icon === undefined ? null : (
        <Icon
          aria-hidden
          strokeWidth={1.75}
          className={`size-5 shrink-0 ${isActive ? "text-primary dark:text-brand-on-dark" : "text-muted-foreground"}`}
        />
      )}
      <span className="min-w-0 flex-1 truncate">{props.link.label}</span>
    </Anchor>
  );
}

function Category(props: {
  readonly category: ShellCategory;
  readonly groupId: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly active: string | undefined;
  readonly linkComponent: ShellLinkComponent | undefined;
}) {
  const { category } = props;

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        aria-expanded={props.open}
        aria-controls={props.groupId}
        // Named by the category alone; the entry count is its description.
        aria-labelledby={`${props.groupId}-name`}
        aria-describedby={`${props.groupId}-count`}
        onClick={props.onToggle}
        className={`${rowBase} ${treeRow} w-full text-left ${rowIdle}`}
      >
        <ChevronDown
          aria-hidden
          strokeWidth={1.75}
          className={`size-4 shrink-0 text-muted-foreground motion-safe:transition-transform ${props.open ? "" : "-rotate-90"}`}
        />
        <span
          id={`${props.groupId}-name`}
          title={category.name}
          className="min-w-0 flex-1 truncate"
        >
          {category.name}
        </span>
        <span id={`${props.groupId}-count`}>
          <CountPill>{category.entries.length}</CountPill>
        </span>
      </button>
      {props.open ? (
        <div
          role="group"
          id={props.groupId}
          aria-label={category.name}
          className="ml-5 flex flex-col gap-0.5 border-l border-border pl-3"
        >
          {category.entries.map((entry) => (
            <Row
              key={entry.id}
              link={entry}
              active={props.active}
              height={treeRow}
              idle={rowChild}
              linkComponent={props.linkComponent}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The shell's navigation rail (R-27, R-29, R-31). The workspace chrome shows the workspace links,
 * the pinned rail, and one disclosure per category; the admin chrome shows one captioned group per
 * admin group, never indented. A row renders through the host's link component for a path of the
 * app, so a client router opens it without a document load. A row under `/viewer/` stays a plain
 * anchor, so a viewer's own policy is installed before its frame renders (R-42).
 */
export function NavigationRail(props: NavigationRailProps) {
  const { navigation, strings } = props;
  const active = activeHref(navigation, props.currentPath);
  const idPrefix = useId();

  // The server render shows every category expanded; the device's choice applies after mount.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  useEffect(() => {
    setCollapsed(readCollapsed(deviceStorage()));
  }, []);

  const toggle = (id: string) => {
    const next = new Set(collapsed);

    if (!next.delete(id)) next.add(id);
    setCollapsed(next);
    writeCollapsed(deviceStorage(), next);
  };

  if (props.chrome === "admin") {
    return (
      <div className="flex flex-col">
        {navigation.admin
          .filter((group) => group.entries.length > 0)
          .map((group) => (
            <nav
              key={group.id}
              aria-label={group.label}
              className="flex flex-col gap-0.5"
            >
              <Caption>{group.label}</Caption>
              {group.entries.map((entry) => (
                <Row
                  key={entry.id}
                  link={entry}
                  active={active}
                  height={navRow}
                  defaultIcon={Box}
                  linkComponent={props.linkComponent}
                />
              ))}
            </nav>
          ))}
      </div>
    );
  }

  const categories = navigation.categories.filter(
    (category) => category.entries.length > 0
  );

  return (
    <div className="flex flex-col">
      {navigation.workspace.length === 0 ? null : (
        <nav aria-label={strings.workspace} className="flex flex-col gap-0.5">
          <Caption>{strings.workspace}</Caption>
          {navigation.workspace.map((link) => (
            <Row
              key={link.id}
              link={link}
              active={active}
              height={navRow}
              defaultIcon={Box}
              linkComponent={props.linkComponent}
            />
          ))}
        </nav>
      )}
      {navigation.pinned.length === 0 ? null : (
        <nav aria-label={strings.pinned} className="flex flex-col gap-0.5">
          <Caption>{strings.pinned}</Caption>
          {navigation.pinned.map((link) => (
            <Row
              key={link.id}
              link={link}
              active={active}
              height={treeRow}
              linkComponent={props.linkComponent}
            />
          ))}
        </nav>
      )}
      {categories.length === 0 ? null : (
        <nav aria-label={strings.categories} className="flex flex-col gap-0.5">
          <Caption>{strings.categories}</Caption>
          {categories.map((category) => (
            <Category
              key={category.id}
              category={category}
              groupId={`${idPrefix}-${category.id}`}
              open={!collapsed.has(category.id)}
              onToggle={() => toggle(category.id)}
              active={active}
              linkComponent={props.linkComponent}
            />
          ))}
        </nav>
      )}
    </div>
  );
}
