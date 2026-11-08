"use client";

import {
  Button,
  buttonVariants,
  DataTable,
  type DataTableColumn,
  EmptyState,
  focusRing,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  LabelPill,
  StatusPill,
  ToggleGroup,
  ToggleGroupItem,
} from "@genie/ui";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import { UserIcon, UsersIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import type {
  AccessPath,
  AccessSubject,
} from "../../services/roles/effective-access.ts";
import type { GrantRecipients, GrantRow } from "../../services/roles/grants.ts";
import type { RoleRow } from "../../services/roles/index.ts";
import { HelpIcon, SearchIcon } from "../admin/icons.tsx";
import { fmtDate } from "../audit/helpers.ts";
import { PageLink } from "../shell/page-link.tsx";
import { AccessHelp } from "./access-help.tsx";
import { accessHref } from "./access-link.ts";
import { type OverviewRow, overviewRows } from "./overview-view.ts";
import {
  ChoicePicker,
  groupChoices,
  personChoices,
  type PickerGroup,
} from "./recipient-picker.tsx";

export type OverviewPage = {
  /** The shown page, newest first. */
  readonly paths: readonly AccessPath[];
  /** The number of the page's first row, from 1. */
  readonly from: number;
  /** Every path of the subject before the search: the header count (O5). */
  readonly total: number;
  /** The paths that match the search: the pager total. */
  readonly matches: number;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
};

export type OverviewScreenProps = {
  readonly catalogue: readonly GrantRow[] | undefined;
  readonly recipients: GrantRecipients | undefined;
  /** Every role, for the role lookup (`d8l5.46`). */
  readonly roles: readonly RoleRow[] | undefined;
  readonly subject: AccessSubject | null;
  /** Null when the administrator switches between the lookups. */
  readonly onSubjectChange: (next: AccessSubject | null) => void;
  /** Called 300 ms after the last keystroke (O12). */
  readonly onQueryChange: (query: string) => void;
  /** Undefined while the first page of the subject loads. */
  readonly page: OverviewPage | undefined;
  readonly onPage: (step: -1 | 1) => void;
  /** A page or a search loads: the pager buttons wait. */
  readonly paging: boolean;
  /** Every path of a person subject (O4). */
  readonly personPaths: readonly AccessPath[] | undefined;
  /** Record labels by `scopeKey`, only for records the viewer can open (AD10). */
  readonly recordLabels: ReadonlyMap<string, string>;
  /** The tenant's default time zone, for the Added date (O11). */
  readonly timeZone: string;
  /** Set only for a viewer who holds `core:audit:read` (O10). */
  readonly auditLogHref?: string | undefined;
  readonly error?: string | undefined;
};

type Lookup = "recipient" | "module" | "role";

const keyOf = (subject: AccessSubject) => `${subject.type}:${subject.id}`;

const lookupOf = (subject: AccessSubject): Lookup =>
  subject.type === "module" || subject.type === "role"
    ? subject.type
    : "recipient";

const PICKER = {
  recipient: {
    prompt: "Choose a group or person",
    search: "Search groups and people",
  },
  module: { prompt: "Choose a module", search: "Search modules" },
  role: { prompt: "Choose a role", search: "Search roles" },
} as const;

/** One group per module in catalogue order, then Core for the roles of no module. */
function roleGroups(
  catalogue: readonly GrantRow[],
  roles: readonly RoleRow[]
): readonly PickerGroup<AccessSubject>[] {
  const choices = (moduleId: string | null) =>
    roles.flatMap((role) =>
      role.moduleId === moduleId
        ? [
            {
              key: `role:${role.id}`,
              name: role.name,
              detail:
                role.description !== ""
                  ? role.description
                  : role.kind === "custom"
                    ? "Custom role"
                    : "System role",
              value: { type: "role", id: role.id } as const,
            },
          ]
        : []
    );

  const moduleIds = [
    ...new Set([
      ...catalogue.map((row) => row.id),
      ...roles.flatMap((role) =>
        role.moduleId === null ? [] : [role.moduleId]
      ),
    ]),
  ];

  return [
    ...moduleIds.map((id) => ({
      label: catalogue.find((row) => row.id === id)?.name ?? id,
      choices: choices(id),
    })),
    { label: "Core", choices: choices(null) },
  ].filter((group) => group.choices.length > 0);
}

function moduleGroups(
  catalogue: readonly GrantRow[]
): readonly PickerGroup<AccessSubject>[] {
  const choices = (group: GrantRow["group"]) =>
    catalogue.flatMap((row) =>
      row.group === group
        ? [
            {
              key: `module:${row.id}`,
              name: row.name,
              detail: row.enabled
                ? (row.description ?? row.name)
                : "Switched off",
              value: { type: "module", id: row.id } as const,
            },
          ]
        : []
    );

  return [
    { label: "Modules", choices: choices("modules") },
    { label: "Core", choices: choices("core") },
  ];
}

function subjectName(
  subject: AccessSubject,
  catalogue: readonly GrantRow[],
  recipients: GrantRecipients | undefined,
  roles: readonly RoleRow[] | undefined
): string {
  if (subject.type === "module") {
    return catalogue.find((row) => row.id === subject.id)?.name ?? subject.id;
  }

  if (subject.type === "role") {
    return roles?.find((role) => role.id === subject.id)?.name ?? "";
  }

  const list =
    subject.type === "group" ? recipients?.groups : recipients?.people;

  return list?.find((entry) => entry.id === subject.id)?.name ?? "";
}

function WhoIcon(props: { readonly row: OverviewRow }) {
  const Icon = props.row.holder.type === "user" ? UserIcon : UsersIcon;

  return (
    <Icon
      aria-hidden="true"
      className="size-4 shrink-0 text-muted-foreground"
    />
  );
}

const Muted = (props: { readonly children: ReactNode }) => (
  <span className="block text-xs font-normal text-muted-foreground">
    {props.children}
  </span>
);

const Pill = (props: { readonly children: ReactNode }) => (
  <span className="mt-1 flex flex-wrap gap-1">{props.children}</span>
);

const NotInEffect = (props: { readonly row: OverviewRow }) =>
  props.row.notInEffect.length === 0 ? null : (
    <StatusPill tone="warning">Not in effect</StatusPill>
  );

const Reasons = (props: { readonly row: OverviewRow }) =>
  props.row.notInEffect.length === 0 ? null : (
    <Muted>{props.row.notInEffect.join(" · ")}</Muted>
  );

const ModuleCell = (props: { readonly row: OverviewRow }) => (
  <>
    {props.row.module}
    {props.row.record === null ? null : (
      <Pill>
        {/* The id breaks, so a long one neither clips a phone card nor widens the column. */}
        <LabelPill>
          One record ·{" "}
          <span className="min-w-0 whitespace-normal wrap-anywhere">
            {props.row.record}
          </span>
        </LabelPill>
      </Pill>
    )}
  </>
);

const RoleCell = (props: { readonly row: OverviewRow }) => (
  <>
    {props.row.role}
    {props.row.custom ? (
      <Pill>
        <LabelPill>Custom role</LabelPill>
      </Pill>
    ) : null}
  </>
);

const PathCell = (props: { readonly row: OverviewRow }) => (
  <>
    {props.row.path}
    {props.row.alsoThrough.length === 0 ? null : (
      <Muted>also through {props.row.alsoThrough.join(", ")}</Muted>
    )}
  </>
);

const AddedCell = (props: {
  readonly row: OverviewRow;
  readonly timeZone: string;
}) => (
  <>
    <span className="whitespace-nowrap tabular-nums">
      {fmtDate(props.row.addedAt, props.timeZone)}
    </span>
    {props.row.addedBy === null ? null : <Muted>by {props.row.addedBy}</Muted>}
  </>
);

function columnsOf(timeZone: string): readonly DataTableColumn<OverviewRow>[] {
  return [
    {
      id: "who",
      header: "Who",
      cell: (row) => (
        <span className="flex items-start gap-2">
          <span className="pt-0.5">
            <WhoIcon row={row} />
          </span>
          <span className="min-w-0">
            {row.holder.name}
            {row.notInEffect.length === 0 ? null : (
              <Pill>
                <NotInEffect row={row} />
              </Pill>
            )}
            <Reasons row={row} />
          </span>
        </span>
      ),
    },
    { id: "module", header: "Module", cell: (row) => <ModuleCell row={row} /> },
    { id: "role", header: "Role", cell: (row) => <RoleCell row={row} /> },
    { id: "path", header: "Path", cell: (row) => <PathCell row={row} /> },
    {
      id: "added",
      header: "Added",
      cell: (row) => <AddedCell row={row} timeZone={timeZone} />,
    },
  ];
}

/** The four facts of a phone card, as the table columns name them. */
function CardFacts(props: {
  readonly row: OverviewRow;
  readonly timeZone: string;
}) {
  const facts = [
    ["Module", <ModuleCell key="m" row={props.row} />],
    ["Role", <RoleCell key="r" row={props.row} />],
    ["Path", <PathCell key="p" row={props.row} />],
    ["Added", <AddedCell key="a" row={props.row} timeZone={props.timeZone} />],
  ] as const;

  return (
    <dl className="mt-2 flex flex-col gap-1.5">
      {facts.map(([term, value]) => (
        <div key={term} className="flex gap-3">
          <dt className="w-16 shrink-0 pt-0.5 text-xs text-muted-foreground">
            {term}
          </dt>
          <dd className="min-w-0 wrap-anywhere">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One subject's results. Keyed by the subject, so its search text starts empty on each. */
function Results(
  props: OverviewScreenProps & { readonly subject: AccessSubject }
) {
  const [text, setText] = useState("");

  const search = useDebouncedCallback(props.onQueryChange, { wait: 300 });

  const catalogue = props.catalogue ?? [];

  // A module or a role has holders. A group or a person has assignments, and a Grants link.
  const byHolder =
    props.subject.type === "module" || props.subject.type === "role";

  const name = subjectName(
    props.subject,
    catalogue,
    props.recipients,
    props.roles
  );

  const { page } = props;

  if (page === undefined) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading the results for {name}…
      </p>
    );
  }

  const rows = overviewRows({
    subject: props.subject,
    paths: page.paths,
    personPaths: props.personPaths,
    catalogue,
    recipients: props.recipients ?? { groups: [], people: [] },
    recordLabels: props.recordLabels,
  });

  const to = page.from + page.paths.length - 1;

  const label = byHolder ? `Holders of ${name}` : `Assignments for ${name}`;

  const nobody =
    props.subject.type === "role"
      ? `Nobody holds ${name} yet.`
      : props.subject.type === "module"
        ? `Nobody holds a role of ${name}.`
        : `${name} holds no role.`;

  return (
    <section
      aria-label="Results"
      className="flex flex-col rounded-xl border border-border bg-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 md:px-5">
        {/* A search narrows the count to "3 of 5", and a screen reader hears it (`d8l5.45`). */}
        <p role="status" className="text-sm">
          {page.matches < page.total ? (
            <>
              <b className="font-semibold tabular-nums">{page.matches}</b> of{" "}
              <span className="tabular-nums">{page.total}</span>{" "}
            </>
          ) : (
            <>
              <b className="font-semibold tabular-nums">{page.total}</b>{" "}
            </>
          )}
          {byHolder ? "holder" : "assignment"}
          {page.total === 1 ? "" : "s"} {byHolder ? "of" : "for"}{" "}
          <b className="font-semibold">{name}</b>
        </p>
        {page.total === 0 ? null : (
          <InputGroup className="w-full md:max-w-xs">
            <InputGroupInput
              type="search"
              value={text}
              aria-label="Search these results"
              placeholder="Search these results"
              onChange={(event) => {
                setText(event.target.value);
                search(event.target.value.trim());
              }}
            />
            <InputGroupAddon>
              <InputGroupText>
                <SearchIcon aria-hidden="true" />
              </InputGroupText>
            </InputGroupAddon>
          </InputGroup>
        )}
        {byHolder ? null : (
          <PageLink
            href={accessHref({ recipient: props.subject.id })}
            className={`${buttonVariants({ variant: "secondary", size: "sm" })} ${focusRing}`}
          >
            Change access
          </PageLink>
        )}
      </div>

      {page.total === 0 ? (
        <p className="border-t border-border px-4 py-6 text-sm text-muted-foreground md:px-5">
          {nobody}
        </p>
      ) : page.matches === 0 ? (
        <p className="border-t border-border px-4 py-6 text-sm text-muted-foreground md:px-5">
          No row matches the search.
        </p>
      ) : (
        <div className="border-t border-border">
          <DataTable<OverviewRow>
            label={label}
            rows={rows}
            rowKey={(row) => row.key}
            rowLabel={(row) => `${row.holder.name}, ${row.role}`}
            columns={columnsOf(props.timeZone)}
            framed={false}
            card={{
              media: (row) => <WhoIcon row={row} />,
              title: (row) => row.holder.name,
              badge: (row) => <NotInEffect row={row} />,
              detail: (row) =>
                row.notInEffect.length === 0
                  ? null
                  : row.notInEffect.join(" · "),
              content: (row) => (
                <CardFacts row={row} timeZone={props.timeZone} />
              ),
            }}
            footer={
              <>
                <span className="self-center tabular-nums">
                  {page.from}–{to} of {page.matches}
                </span>
                <span className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!page.hasPrevious || props.paging}
                    onClick={() => props.onPage(-1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!page.hasNext || props.paging}
                    onClick={() => props.onPage(1)}
                  >
                    Next
                  </Button>
                </span>
              </>
            }
          />
        </div>
      )}

      <p className="flex gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground md:px-5">
        <HelpIcon aria-hidden="true" className="size-4 shrink-0" />
        <span>
          Access adds up. Removing one path leaves the others, which the Path
          column names. What changed and when is in the{" "}
          {props.auditLogHref === undefined ? (
            "audit log"
          ) : (
            <a
              href={props.auditLogHref}
              className="font-medium text-foreground underline underline-offset-2"
            >
              audit log
            </a>
          )}
          .
        </span>
      </p>
    </section>
  );
}

/**
 * The Overview tab of Access (R-37b, R-37d): one subject, a group or a person, or a module, and
 * every path to a role, searchable and paged by the server. It writes nothing.
 */
export function OverviewScreen(props: OverviewScreenProps): ReactNode {
  const [chosen, setChosen] = useState<Lookup>("recipient");

  // A subject that a link sets after mount still presses its own segment.
  const lookup = props.subject === null ? chosen : lookupOf(props.subject);

  const groups: readonly PickerGroup<AccessSubject>[] =
    lookup === "module"
      ? moduleGroups(props.catalogue ?? [])
      : lookup === "role"
        ? roleGroups(props.catalogue ?? [], props.roles ?? [])
        : props.recipients === undefined
          ? []
          : [
              { label: "Groups", choices: groupChoices(props.recipients) },
              { label: "People", choices: personChoices(props.recipients) },
            ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <ToggleGroup<Lookup>
          aria-label="Look up"
          value={[lookup]}
          onValueChange={(values) => {
            // A second press on the pressed segment empties the value: keep the segment.
            const [next] = values;

            if (next === undefined || next === lookup) return;

            setChosen(next);
            props.onSubjectChange(null);
          }}
        >
          <ToggleGroupItem value="recipient">
            By group or person
          </ToggleGroupItem>
          <ToggleGroupItem value="module">By module</ToggleGroupItem>
          <ToggleGroupItem value="role">By role</ToggleGroupItem>
        </ToggleGroup>
        <div className="w-full md:w-96">
          <ChoicePicker<AccessSubject>
            key={lookup}
            prompt={PICKER[lookup].prompt}
            searchLabel={PICKER[lookup].search}
            empty="Nothing matches."
            groups={groups}
            value={props.subject === null ? null : keyOf(props.subject)}
            trigger="name"
            onPick={(next) => {
              if (
                props.subject === null ||
                keyOf(next) !== keyOf(props.subject)
              )
                props.onSubjectChange(next);
            }}
          />
        </div>
        <span className="ml-auto">
          <AccessHelp align="end" />
        </span>
      </div>

      {props.error === undefined ? null : (
        <p role="alert" className="text-sm text-destructive">
          {props.error}
        </p>
      )}

      {props.subject === null ? (
        <EmptyState
          variant="framed"
          icon={<SearchIcon />}
          title="Choose what to look up"
          description="Pick a group or a person, a module, or a role. Nothing is read before you choose, so there is no table of everybody against everything."
        />
      ) : (
        <Results
          key={keyOf(props.subject)}
          {...props}
          subject={props.subject}
        />
      )}
    </div>
  );
}
