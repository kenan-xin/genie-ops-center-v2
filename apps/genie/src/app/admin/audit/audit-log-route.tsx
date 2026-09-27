"use client";

import {
  AuditLog,
  type AuditEvent,
  type AuditFilterOptions,
  type AuditFilters,
  type AuditViewer,
} from "@genie/core/features/audit";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation.js";
import { useState } from "react";

type Cursor = {
  readonly occurredAt: string;
  readonly id: string;
};

type AuditPageView = {
  readonly events: readonly AuditEvent[];
  readonly total: number;
  readonly nextCursor: Cursor | null;
  readonly filterOptions: AuditFilterOptions;
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
