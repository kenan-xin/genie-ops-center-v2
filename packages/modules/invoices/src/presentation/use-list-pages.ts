"use client";

import type { DatasetCursor } from "@genie/core/rpc";
import type { ListDefinition, ListOption, ListParams } from "@genie/ui";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import type { z } from "zod";

/** A definition with the options of one filter, which the page reads from its view. */
export const withOptions = (
  definition: ListDefinition,
  id: string,
  options: readonly ListOption[]
): ListDefinition => ({
  ...definition,
  filters: definition.filters.map((filter) =>
    filter.id === id ? { ...filter, options } : filter
  ),
});

/**
 * The address parameters that a list procedure takes. One that its schema refuses, such as a
 * hand-edited value, is left out, so an old address reads as the default (Review Focus 4).
 */
export function procedureParams<
  Fields extends Readonly<Record<string, z.ZodType>>,
>(
  schema: z.ZodObject<Fields>,
  params: ListParams
): z.infer<z.ZodObject<Fields>> {
  const entries = Object.entries(params).filter(
    ([name, value]) => schema.shape[name]?.safeParse(value).success === true
  );

  // SAFETY: each entry passed its own field of the schema, and every field is optional.
  return Object.fromEntries(entries) as z.infer<z.ZodObject<Fields>>;
}

/** One page of a list as its loader and its procedure answer it. */
type ListPage = {
  readonly rows: readonly unknown[];
  readonly next: DatasetCursor | null;
};

/**
 * The rows of a list read page by page past the 1,000-row cap (czjw.28), as the audit log pages:
 * the server-rendered first page seeds the query, and each "Show more" reads the next page from
 * the last cursor. Without a first page, as under a filter, page one is read from `read`.
 */
export function useListPages<Page extends ListPage>(input: {
  readonly key: readonly unknown[];
  readonly first: Page | undefined;
  /** `null` reads page one again, so a refetch brings a changed first page. */
  readonly read: (after: DatasetCursor | null) => Promise<Page>;
}) {
  const { first } = input;

  const query = useInfiniteQuery({
    queryKey: input.key,
    // SAFETY: page one has no cursor; the server already read it, so the param is a null cursor.
    initialPageParam: null as DatasetCursor | null,
    queryFn: ({ pageParam }) => input.read(pageParam),
    getNextPageParam: (last) => last.next,
    initialData: () =>
      first === undefined ? undefined : { pages: [first], pageParams: [null] },
    // A new filter keeps the old rows on screen until its page one arrives.
    placeholderData: keepPreviousData,
    // The first page came with the request; a page read now would only repeat it.
    staleTime: Number.POSITIVE_INFINITY,
    // Each visit brings a fresh first page; a cached one would hide a save made on another screen.
    gcTime: 0,
  });

  const pages = query.data?.pages ?? [];

  return {
    rows: pages.flatMap((page): Page["rows"][number][] => [...page.rows]),
    /** Page one, for what the list says about the whole read, such as a summary. */
    first: pages[0],
    /** Page one is still being read. */
    pending: query.isPending,
    /** Page one could not be read. */
    broken: query.isError && pages.length === 0,
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
