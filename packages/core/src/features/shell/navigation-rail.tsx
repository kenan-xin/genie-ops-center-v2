"use client";

import { focusRing, Tooltip, TooltipContent, TooltipTrigger } from "@genie/ui";
import {
  Banknote,
  Blocks,
  Box,
  ChevronDown,
  GripVertical,
  Inbox,
  Key,
  LayoutDashboard,
  MessageCircle,
  Palette,
  Presentation,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Tags,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useId,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";

import type { NavigationIcon } from "../../lib/module-contract/module.ts";
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
  /** The 60 px icon rail: icons only, each label as hidden text and a tooltip on the right. */
  readonly rail?: boolean | undefined;
};

// Roles is ShieldCheck, not Shield: the admin capture draws the check.
const CORE_ICONS = new Map<string, LucideIcon>([
  ["core-ask", MessageCircle],
  ["core-people", Users],
  ["core-groups", UsersRound],
  ["core-roles", ShieldCheck],
  ["core-access", Key],
  ["core-branding", Palette],
  ["core-settings", Settings],
  ["core-audit", ScrollText],
  ["core-modules", Blocks],
  ["core-categories", Tags],
]);

// The icons a module entry may name (module contract, Navigation row).
const MODULE_ICONS: Readonly<Record<NavigationIcon, LucideIcon>> = {
  "banknote": Banknote,
  "inbox": Inbox,
  "layout-dashboard": LayoutDashboard,
  "presentation": Presentation,
  "receipt": Receipt,
};

// Rows are 44px under lg (touch targets), then 40px nav rows and 32px tree rows.
const rowBase = `flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm motion-safe:transition-colors lg:min-h-0 ${focusRing}`;

const navRow = "lg:h-10";

const treeRow = "lg:h-8";

const rowIdle = "font-medium text-foreground hover:bg-border/60";

// A category is a group caption that also collapses its group (6wz1.102): the caption's type,
// 44 px tall under lg like every row, and its own hover tone instead of a row fill.
const captionButton = `group flex min-h-11 w-full items-end gap-1.5 rounded-md px-3 pt-5 pb-1.5 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase motion-safe:transition-colors hover:text-foreground lg:min-h-0 ${focusRing}`;

// A filled row, not a hairline: in dark the card is the panel's own color, so the fill steps up.
const rowActive =
  "bg-card font-semibold text-primary ring-1 ring-border dark:bg-border dark:text-brand-on-dark dark:ring-muted-foreground/30";

/** The browser's `localStorage`, or none where reading it throws. */
export function deviceStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function Caption(props: {
  readonly children: ReactNode;
  readonly rail: boolean;
}) {
  // The rail splits groups with a short hairline; each nav keeps its name.
  if (props.rail)
    return (
      <div aria-hidden="true" className="mx-auto my-2.5 h-px w-6 bg-border" />
    );

  return (
    <div className="px-3 pt-5 pb-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
      {props.children}
    </div>
  );
}

/**
 * A 40 px rail row that the tooltip trigger renders as, so the whole row opens the tooltip on
 * hover and focus. The Base UI trigger carries no style of its own, as with the user footer.
 */
function RailLink({
  anchor: Anchor,
  active,
  ...rest
}: ComponentProps<"a"> & {
  readonly anchor: ShellLinkComponent | "a";
  readonly href: string;
  readonly active: boolean;
}) {
  return (
    <Anchor
      {...rest}
      aria-current={active ? "page" : undefined}
      className={`flex size-10 items-center justify-center rounded-lg motion-safe:transition-colors ${focusRing} ${active ? rowActive : rowIdle}`}
    />
  );
}

function Row(props: {
  readonly link: ShellLink;
  readonly active: string | undefined;
  readonly height: string;
  readonly idle?: string;
  /** Nav rows draw an icon: the entry's own, else this one, so labels start in one column. */
  readonly defaultIcon?: LucideIcon;
  /** A pinned row leads with the grip of the reference design instead of an icon. */
  readonly grip?: boolean;
  readonly linkComponent: ShellLinkComponent | undefined;
  readonly rail: boolean;
}) {
  const isActive = props.link.href === props.active;
  const Anchor = linkFor(props.link.href, props.linkComponent);

  const iconClass = `size-5 shrink-0 ${isActive ? "text-primary dark:text-brand-on-dark" : "text-muted-foreground"}`;

  if (props.rail) {
    // Every row draws an icon in the rail, so a tree or pinned row falls back to Box.
    const RailIcon =
      CORE_ICONS.get(props.link.id) ??
      (props.link.icon === undefined ? Box : MODULE_ICONS[props.link.icon]);

    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <RailLink
              anchor={Anchor}
              href={props.link.href}
              active={isActive}
            />
          }
        >
          <RailIcon aria-hidden strokeWidth={1.75} className={iconClass} />
          <span className="sr-only">{props.link.label}</span>
        </TooltipTrigger>
        <TooltipContent side="right">{props.link.label}</TooltipContent>
      </Tooltip>
    );
  }

  // Tree rows stay icon-free, as in the reference design; only nav rows draw the entry's icon.
  const Icon =
    CORE_ICONS.get(props.link.id) ??
    (props.defaultIcon === undefined || props.link.icon === undefined
      ? props.defaultIcon
      : MODULE_ICONS[props.link.icon]);

  return (
    <Anchor
      href={props.link.href}
      aria-current={isActive ? "page" : undefined}
      className={`${rowBase} ${props.height} ${isActive ? rowActive : (props.idle ?? rowIdle)}`}
    >
      {props.grip === true ? (
        <GripVertical
          aria-hidden
          strokeWidth={1.75}
          className="size-4 shrink-0 text-muted-foreground/70"
        />
      ) : null}
      {Icon === undefined ? null : (
        <Icon aria-hidden strokeWidth={1.75} className={iconClass} />
      )}
      <Tooltip>
        <TooltipTrigger render={<span className="min-w-0 flex-1" />}>
          <span className="block truncate">{props.link.label}</span>
        </TooltipTrigger>
        <TooltipContent>{props.link.label}</TooltipContent>
      </Tooltip>
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
  readonly rail: boolean;
}) {
  const { category } = props;

  // The rail shows no category header, and its entries flat, also when it is collapsed.
  if (props.rail)
    return (
      <div
        role="group"
        aria-label={category.name}
        className="flex flex-col items-center gap-0.5"
      >
        {category.entries.map((entry) => (
          <Row
            key={entry.id}
            link={entry}
            active={props.active}
            height={treeRow}
            linkComponent={props.linkComponent}
            rail
          />
        ))}
      </div>
    );

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
        className={captionButton}
      >
        <span id={`${props.groupId}-name`} className="min-w-0 flex-1 truncate">
          {category.name}
        </span>
        <span
          id={`${props.groupId}-count`}
          className="font-medium tracking-normal tabular-nums"
        >
          {category.entries.length}
        </span>
        {/* Shown on hover and focus, and always while collapsed, so a closed group says so. */}
        <ChevronDown
          aria-hidden
          strokeWidth={1.75}
          className={`size-3.5 shrink-0 motion-safe:transition ${props.open ? "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" : "-rotate-90"}`}
        />
      </button>
      {props.open ? (
        <div
          role="group"
          id={props.groupId}
          aria-label={category.name}
          className="flex flex-col gap-0.5"
        >
          {category.entries.map((entry) => (
            <Row
              key={entry.id}
              link={entry}
              active={props.active}
              height={navRow}
              defaultIcon={Box}
              linkComponent={props.linkComponent}
              rail={false}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The shell's navigation rail (R-27, R-29, R-31). The workspace chrome shows the workspace links,
 * the pinned rail, and one captioned group per category that collapses; the admin chrome shows one captioned group per
 * admin group, never indented. A row renders through the host's link component for a path of the
 * app, so a client router opens it without a document load. A row under `/viewer/` stays a plain
 * anchor, so a viewer's own policy is installed before its frame renders (R-42).
 */
export function NavigationRail(props: NavigationRailProps) {
  const { navigation, strings } = props;
  const rail = props.rail === true;
  const active = activeHref(navigation, props.currentPath);
  const list = `flex flex-col gap-0.5 ${rail ? "items-center" : ""}`;
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
            <nav key={group.id} aria-label={group.label} className={list}>
              <Caption rail={rail}>{group.label}</Caption>
              {group.entries.map((entry) => (
                <Row
                  key={entry.id}
                  link={entry}
                  active={active}
                  height={navRow}
                  defaultIcon={Box}
                  linkComponent={props.linkComponent}
                  rail={rail}
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
        <nav aria-label={strings.workspace} className={list}>
          <Caption rail={rail}>{strings.workspace}</Caption>
          {navigation.workspace.map((link) => (
            <Row
              key={link.id}
              link={link}
              active={active}
              height={navRow}
              defaultIcon={Box}
              linkComponent={props.linkComponent}
              rail={rail}
            />
          ))}
        </nav>
      )}
      {navigation.pinned.length === 0 ? null : (
        <nav aria-label={strings.pinned} className={list}>
          <Caption rail={rail}>{strings.pinned}</Caption>
          {navigation.pinned.map((link) => (
            <Row
              key={link.id}
              link={link}
              active={active}
              height={treeRow}
              grip
              linkComponent={props.linkComponent}
              rail={rail}
            />
          ))}
        </nav>
      )}
      {categories.length === 0 ? null : (
        <nav aria-label={strings.categories} className={list}>
          {/* Each category name is its own caption (6wz1.102); the rail keeps its divider. */}
          {rail ? <Caption rail>{strings.categories}</Caption> : null}
          {categories.map((category) => (
            <Category
              key={category.id}
              category={category}
              groupId={`${idPrefix}-${category.id}`}
              open={!collapsed.has(category.id)}
              onToggle={() => toggle(category.id)}
              active={active}
              linkComponent={props.linkComponent}
              rail={rail}
            />
          ))}
        </nav>
      )}
    </div>
  );
}
