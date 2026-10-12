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

import { rpc } from "../../../rpc/client.ts";

type Cursor = {
  readonly occurredAt: string;
  readonly id: string;
};

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
    // The server re-checks `core:audit:read` on every call, so a filter change is refused if the
    // grant is gone; an expired session lands on the sign-in page through the client.
    queryFn: ({ pageParam }) => rpc.audit.list({ filters, cursor: pageParam }),
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
      refreshing={query.isPlaceholderData}
      onChangeAuditFilters={setFilters}
      onLoadMoreAuditEvents={() => {
        void query.fetchNextPage();
      }}
      onOpenAuditTarget={(path) => router.push(path)}
    />
  );
}
