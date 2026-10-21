export type NavigationItem = {
  readonly id: string;
  readonly label: string;
  readonly path: string;
};

export type NavigationListProps = {
  readonly heading: string;
  readonly items: readonly NavigationItem[];
  readonly emptyMessage: string;
};

/**
 * An unfiltered navigation list. Section 0 shows every compiled module's entries
 * (R-23). Hiding a link is not an access control, so the server still enforces
 * every route through `can()`.
 */
export function NavigationList({
  heading,
  items,
  emptyMessage,
}: NavigationListProps) {
  return (
    <nav aria-label={heading}>
      <h2>{heading}</h2>
      {items.length === 0 ? (
        <p>{emptyMessage}</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <a href={item.path}>{item.label}</a>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
