"use client";

import {
  AccessHelp,
  AccessTabs,
  OverviewScreen,
  overviewDefinition,
  parseWho,
  readFilters,
} from "@genie/core/features/access";
import { PageHeader } from "@genie/core/features/shell";
import { useListState } from "@genie/ui";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { appCodeOf, rpc } from "../../../../rpc/client.ts";
import { useRecordLabels } from "../use-record-labels.ts";

type Cursor = Awaited<ReturnType<typeof rpc.roles.assignments>>["nextCursor"];

const FIRST_PAGE: Cursor = null;

/** `roles.assignments` answers not-found for a person or group that went away after its lookup. */
const recipientGone = (cause: unknown) => appCodeOf(cause) === "not-found";

const searchRecipients = (query: string) =>
  rpc.roles.recipients({ query, limit: 10 });

const selected = (path: string) => (id: string) =>
  `${path}?selected=${encodeURIComponent(id)}`;

/**
 * The browser half of the Overview route (d8l5.62). The address holds the search and the filters
 * (P12-8); a `who` is looked up first, and an id that no list holds reads as no filter. Each change
 * of the read's input starts at page 1.
 */
export function OverviewRoute(props: {
  readonly timeZone: string;
  /** Which screens the viewer may open, for the name links (P12-20). */
  readonly links: {
    readonly roles: boolean;
    readonly people: boolean;
    readonly groups: boolean;
  };
}) {
  const t = useTranslations("pages");

  const catalogue = useQuery({
    queryKey: ["access", "catalogue"],
    queryFn: () => rpc.roles.grantCatalogue(),
  });

  // The Roles route reads the same list under the same key.
  const roles = useQuery({
    queryKey: ["roles"],
    queryFn: () => rpc.roles.list(),
  });

  const definition = useMemo(
    () => overviewDefinition(catalogue.data ?? [], roles.data ?? []),
    [catalogue.data, roles.data]
  );

  const state = useListState(definition);

  // A `who` that the read refused as not-found after its lookup reads as no filter (Review Focus 1).
  const [gone, setGone] = useState<string | null>(null);

  const asked = state.params["who"];

  const who = parseWho(asked);

  const lookup = useQuery({
    queryKey: ["access", "who", asked],
    queryFn: async () =>
      who === null
        ? null
        : ((
            await rpc.roles.recipients({
              ids: [who.id],
              kind: who.type,
              archived: true,
              limit: 1,
            })
          ).rows[0] ?? null),
    enabled: who !== null && asked !== gone,
  });

  const read = readFilters({
    params: state.params,
    who: asked !== undefined && asked === gone ? null : lookup.data,
    catalogue: catalogue.data ?? [],
    roles: roles.data ?? [],
  });

  const ready =
    read.ready && catalogue.data !== undefined && roles.data !== undefined;

  const key = JSON.stringify([read.filters, read.query]);

  // The page index belongs to one input; a step that lands after a change leaves the new one alone.
  const [at, setAt] = useState({ key, index: 0 });

  const index = at.key === key ? at.index : 0;

  const results = useInfiniteQuery({
    queryKey: ["access", "assignments", read.filters, read.query],
    queryFn: ({ pageParam }) => {
      const input = { ...read.filters, cursor: pageParam };

      if (read.query === "") return rpc.roles.assignments(input);

      return rpc.roles.assignments({ ...input, query: read.query });
    },
    initialPageParam: FIRST_PAGE,
    getNextPageParam: (last) => last.nextCursor,
    enabled: ready,
    retry: (count, error) => !recipientGone(error) && count < 3,
  });

  const stale =
    read.filters.recipient !== undefined && recipientGone(results.error);

  // Set during render, so the next render reads without the recipient at once.
  if (stale && asked !== undefined && gone !== asked) setGone(asked);

  const personPaths = useQuery({
    queryKey: ["access", "user", read.filters.recipient?.id],
    queryFn: () =>
      rpc.roles.recipientAccess({
        principalType: "user",
        principalId: read.filters.recipient?.id ?? "",
      }),
    enabled: read.filters.recipient?.type === "user",
  });

  const pages = results.data?.pages ?? [];

  const shown = pages[index];

  const page =
    !ready || shown === undefined
      ? undefined
      : {
          paths: shown.paths,
          memberCounts: shown.memberCounts,
          from:
            pages
              .slice(0, index)
              .reduce((sum, earlier) => sum + earlier.paths.length, 0) + 1,
          total: pages[0]?.total ?? 0,
          hasPrevious: index > 0,
          hasNext: index < pages.length - 1 || results.hasNextPage,
        };

  const recordLabels = useRecordLabels(page?.paths);

  return (
    <>
      <PageHeader
        title={t("access.title")}
        description={t("access.overviewDescription")}
      />
      {/* The tab labels start 12 px into their column; the help shares that text edge. */}
      <div className="ps-3 md:hidden">
        <AccessHelp />
      </div>
      <AccessTabs current="overview" />
      <OverviewScreen
        definition={definition}
        state={state}
        catalogue={catalogue.data}
        filters={read.filters}
        who={read.filters.recipient === undefined ? null : lookup.data}
        searchRecipients={searchRecipients}
        page={page}
        onPage={async (step) => {
          const from = key;

          if (step === 1 && index === pages.length - 1) {
            await results.fetchNextPage();
          }

          // A step that lands after the input changed writes the old key, which the new input
          // reads as page 1, so it never moves the new list.
          setAt((current) => ({
            key: from,
            index: Math.max(
              0,
              (current.key === from ? current.index : 0) + step
            ),
          }));
        }}
        paging={results.isFetchingNextPage}
        personPaths={
          read.filters.recipient?.type === "user" ? personPaths.data : undefined
        }
        recordLabels={recordLabels}
        timeZone={props.timeZone}
        roleHref={props.links.roles ? selected("/admin/roles") : undefined}
        personHref={props.links.people ? selected("/admin/people") : undefined}
        groupHref={props.links.groups ? selected("/admin/groups") : undefined}
        {...(catalogue.isError ||
        roles.isError ||
        lookup.isError ||
        personPaths.isError ||
        (results.isError && !stale)
          ? { error: "The access could not be read." }
          : {})}
      />
    </>
  );
}
