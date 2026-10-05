"use client";

import {
  AuditLog,
  type AuditEvent,
  type AuditFilterOptions,
  type AuditFilters,
  type AuditViewer,
} from "@genie/core/features/audit";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation.js";
import { useState } from "react";

import {
  isUnauthenticatedAnswer,
  SESSION_EXPIRED_PATH,
} from "../../../unauthenticated.ts";

type Cursor = {
  readonly occurredAt: string;
  readonly id: string;
};

type AuditPageView = {
  readonly events: readonly AuditEvent[];
  /** Present on the first page only; null on a keyset page. */
  readonly total: number | null;
  readonly nextCursor: Cursor | null;
  /** Present on the first page only; null on a keyset page. */
  readonly filterOptions: AuditFilterOptions | null;
};

/**
 * One page of the reader through the real transport. The procedure answers a query with the tRPC
 * envelope `{ result: { data } }` and no transformer, so the page is plain JSON. The server
 * re-checks `core:audit:read` on every call, so a filter change is refused if the grant is gone.
 */
async function fetchAuditPage(input: {
  readonly filters: AuditFilters;
  readonly cursor: Cursor | null;
}): Promise<AuditPageView> {
  const url = `/api/trpc/audit.list?input=${encodeURIComponent(JSON.stringify(input))}`;

  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    // The session rendered under is gone (idle-expired, capped or revoked): land the browser on
    // the sign-in page's expired state instead of leaving a bare error in the log (R-14, R-17a).
    if (await isUnauthenticatedAnswer(response)) {
      window.location.assign(SESSION_EXPIRED_PATH);

      throw new Error("The audit read was refused: the session expired.");
    }

    throw new Error(`The audit read was refused (${response.status}).`);
  }

  // SAFETY: this route's own `audit.list` procedure returns the page, and the tRPC HTTP adapter
  // wraps a query result as `{ result: { data } }`. The shape below is the one the screen renders.
  const body = (await response.json()) as { result?: { data?: AuditPageView } };
  const page = body.result?.data;

  if (page === undefined) throw new Error("The audit read returned no page.");

  return page;
}

export type AuditLogRouteProps = {
  readonly viewer: AuditViewer;
  readonly initialFilters: AuditFilters;
};

/**
 * The browser half of the Audit log route. The server has already refused a caller without
 * `core:audit:read` before this mounts, so it holds no denied state; it owns the filters and the
 * keyset pages, and the reader itself is presentational.
 */
export function AuditLogRoute(props: AuditLogRouteProps) {
  const router = useRouter();
  const [filters, setFilters] = useState<AuditFilters>(props.initialFilters);

  const query = useInfiniteQuery({
    queryKey: ["audit-log", filters],
    // SAFETY: the first page's param is no cursor at all, which the query sends as a null cursor.
    initialPageParam: null as Cursor | null,
    queryFn: ({ pageParam }) => fetchAuditPage({ filters, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor,
    // A filter change is a new query key. Without the previous pages as a placeholder the route
    // would fall back to its loading state and unmount the screen, which closed the open filter
    // panel and took focus out of the search box after each keystroke.
    placeholderData: keepPreviousData,
  });

  if (query.isPending) {
    return <p role="status">Loading the audit log…</p>;
  }

  if (query.isError) {
    return <p role="alert">The audit log could not be read.</p>;
  }

  const pages = query.data.pages;
  const first = pages[0];

  const filterOptions: AuditFilterOptions = first?.filterOptions ?? {
    actors: [],
    actions: [],
    targetTypes: [],
  };

  const events: AuditEvent[] = pages.flatMap((page) => page.events);

  return (
    <AuditLog
      viewer={props.viewer}
      events={events}
      total={first?.total ?? 0}
      filterOptions={filterOptions}
      filters={filters}
      hasMore={query.hasNextPage}
      loading={query.isFetchingNextPage}
      onChangeAuditFilters={setFilters}
      onLoadMoreAuditEvents={() => {
        void query.fetchNextPage();
      }}
      onOpenAuditTarget={(path) => router.push(path)}
    />
  );
}
