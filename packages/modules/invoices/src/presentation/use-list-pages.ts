"use client";

import type { DatasetCursor } from "@genie/core/rpc";
import { useInfiniteQuery } from "@tanstack/react-query";

/** One page of a list as its loader and its procedure answer it. */
type ListPage<Row> = {
  readonly rows: readonly Row[];
  readonly next: DatasetCursor | null;
};

/**
 * The rows of a list read page by page past the 1,000-row cap (czjw.28), as the audit log pages:
 * the server-rendered first page seeds the query, and each "Show more" reads the next page from
 * the last cursor.
 */
export function useListPages<Row>(input: {
  readonly key: readonly unknown[];
  readonly first: ListPage<Row>;
  /** `null` reads page one again, so a refetch brings a changed first page. */
  readonly read: (after: DatasetCursor | null) => Promise<ListPage<Row>>;
}) {
  const query = useInfiniteQuery({
    queryKey: input.key,
    // SAFETY: page one has no cursor; the server already read it, so the param is a null cursor.
    initialPageParam: null as DatasetCursor | null,
    queryFn: ({ pageParam }) => input.read(pageParam),
    getNextPageParam: (last) => last.next,
    initialData: { pages: [input.first], pageParams: [null] },
    // The first page came with the request; a page read now would only repeat it.
    staleTime: Number.POSITIVE_INFINITY,
    // Each visit brings a fresh first page; a cached one would hide a save made on another screen.
    gcTime: 0,
  });

  return {
    rows: query.data.pages.flatMap((page) => page.rows),
    more: query.hasNextPage,
    loading: query.isFetchingNextPage,
    failed: query.isFetchNextPageError,
    showMore: () => {
      void query.fetchNextPage();
    },
    // Reads every page again, so a changed first page reaches the list (czjw.49).
    reload: () => query.refetch(),
  };
}
