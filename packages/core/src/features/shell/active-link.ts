import type { ShellLink, ShellNavigation } from "./types.ts";

/** Every link the rail can show, over all four lists. */
export function shellLinks(navigation: ShellNavigation): readonly ShellLink[] {
  return [
    ...navigation.workspace,
    ...navigation.pinned,
    ...navigation.categories.flatMap((category) => category.entries),
    ...navigation.admin.flatMap((group) => group.entries),
  ];
}

/**
 * The href of the rail's active row: the longest link over every list that equals `path` or
 * prefixes it at a `/` boundary, so `/admin/people/123` keeps People active.
 */
export function activeHref(
  navigation: ShellNavigation,
  path: string
): string | undefined {
  const hrefs = shellLinks(navigation).map((link) => link.href);

  return hrefs
    .filter((href) => path === href || path.startsWith(`${href}/`))
    .reduce<string | undefined>(
      (longest, href) =>
        longest === undefined || href.length > longest.length ? href : longest,
      undefined
    );
}
