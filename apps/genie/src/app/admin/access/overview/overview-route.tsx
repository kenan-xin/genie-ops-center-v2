"use client";

import {
  AccessTabs,
  linkedSubject,
  OverviewScreen,
} from "@genie/core/features/access";
import { PageHeader } from "@genie/core/features/shell";
import {
  infiniteQueryOptions,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation.js";
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { rpc } from "../../../../rpc/client.ts";
import { useRecordLabels } from "../use-record-labels.ts";

type Subject = ComponentProps<typeof OverviewScreen>["subject"];

type Cursor = Awaited<
  ReturnType<typeof rpc.roles.accessBySubject>
>["nextCursor"];

const FIRST_PAGE: Cursor = null;

const subjectKey = (subject: Subject) =>
  subject === null ? "none" : `${subject.type}:${subject.id}`;

/** One helper for both reads, so an empty search and the header count share one cache entry (O5). */
function pagesOf(subject: Subject, query: string) {
  return infiniteQueryOptions({
    queryKey: ["access", "overview", subjectKey(subject), query],
    queryFn: ({ pageParam }) =>
      rpc.roles.accessBySubject({
        // `enabled` keeps the read from running without a subject (R-37b).
        subject: subject ?? { type: "group", id: "none" },
        query,
        cursor: pageParam,
      }),
    initialPageParam: FIRST_PAGE,
    getNextPageParam: (last) => last.nextCursor,
    enabled: subject !== null,
  });
}

/**
 * The browser half of the Overview route. The subject, the search and the page index live here.
 * A new subject or search starts at page 1. While a new search of the same subject loads, the
 * shown rows stay. They never stay across a change of subject (O12).
 */
export function OverviewRoute(props: {
  readonly timeZone: string;
  readonly auditLog: boolean;
}) {
  const t = useTranslations("pages");

  const [subject, setSubject] = useState<Subject>(null);

  const [query, setQuery] = useState("");

  const lookup = `${subjectKey(subject)}|${query}`;

  // The page index belongs to one subject and search. Each change sets a new pair at
  // page 1, and a step that lands after the change leaves the new pair alone.
  const [at, setAt] = useState({ lookup, index: 0 });

  const index = at.lookup === lookup ? at.index : 0;

  const catalogue = useQuery({
    queryKey: ["access", "catalogue"],
    queryFn: () => rpc.roles.grantCatalogue(),
  });

  const recipients = useQuery({
    queryKey: ["access", "recipients"],
    queryFn: () => rpc.roles.grantRecipients(),
  });

  // The Roles route reads the same list under the same key.
  const roles = useQuery({
    queryKey: ["roles"],
    queryFn: () => rpc.roles.list(),
  });

  const search = useSearchParams();

  const pathname = usePathname();

  const linkModule = search.get("module") ?? undefined;

  const linkRole = search.get("role") ?? undefined;

  const choose = useCallback((next: Subject) => {
    setSubject(next);
    setQuery("");
    setAt({ lookup: `${subjectKey(next)}|`, index: 0 });
  }, []);

  // A Roles or Modules link chooses once, when both lists arrive, and only an id they hold (P05-9).
  // The address keeps the parameter, so a reload chooses it again.
  const linkApplied = useRef(false);

  useEffect(() => {
    if (
      linkApplied.current ||
      catalogue.data === undefined ||
      roles.data === undefined
    ) {
      return;
    }

    linkApplied.current = true;

    const linked = linkedSubject(
      { module: linkModule, role: linkRole },
      catalogue.data,
      roles.data
    );

    if (linked !== null) choose(linked);
  }, [catalogue.data, roles.data, linkModule, linkRole, choose]);

  const results = useInfiniteQuery({
    ...pagesOf(subject, query),
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === subjectKey(subject) ? previous : undefined,
  });

  const counted = useInfiniteQuery(pagesOf(subject, ""));

  const personPaths = useQuery({
    queryKey: ["access", "user", subject?.id],
    queryFn: () =>
      rpc.roles.recipientAccess({
        principalType: "user",
        principalId: subject?.id ?? "",
      }),
    enabled: subject?.type === "user",
  });

  const pages = results.data?.pages ?? [];

  const shown = pages[index];

  const matches = pages[0]?.total ?? 0;

  const page =
    subject === null || shown === undefined
      ? undefined
      : {
          paths: shown.paths,
          from:
            pages
              .slice(0, index)
              .reduce((sum, earlier) => sum + earlier.paths.length, 0) + 1,
          total: counted.data?.pages[0]?.total ?? matches,
          matches,
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
      <AccessTabs current="overview" />
      <OverviewScreen
        catalogue={catalogue.data}
        recipients={recipients.data}
        roles={roles.data}
        subject={subject}
        onSubjectChange={(next) => {
          choose(next);

          // Another pick drops the link, so a reload never brings the old subject back.
          if (linkModule !== undefined || linkRole !== undefined) {
            window.history.replaceState(null, "", pathname);
          }
        }}
        onQueryChange={(next) => {
          setQuery(next);
          setAt({ lookup: `${subjectKey(subject)}|${next}`, index: 0 });
        }}
        page={page}
        onPage={async (step) => {
          const from = lookup;

          if (step === 1 && index === pages.length - 1) {
            await results.fetchNextPage();
          }

          // A step that lands after the lookup changed belongs to the old one: drop it.
          setAt((current) =>
            current.lookup === from
              ? { lookup: from, index: Math.max(0, current.index + step) }
              : current
          );
        }}
        paging={results.isFetchingNextPage || results.isPlaceholderData}
        personPaths={personPaths.data}
        recordLabels={recordLabels}
        timeZone={props.timeZone}
        auditLogHref={props.auditLog ? "/admin/audit" : undefined}
        {...(catalogue.isError ||
        recipients.isError ||
        roles.isError ||
        results.isError ||
        counted.isError ||
        personPaths.isError
          ? { error: "The access could not be read." }
          : {})}
      />
    </>
  );
}
