import type { ReactNode } from "react";

/**
 * The neutral tile that leads a phone card (fix list "Phone card lists (layout)"): a 40 px rounded
 * square around a kind icon. A person's card leads with the `Avatar` of the person instead.
 */
export function IconTile(props: { readonly children: ReactNode }) {
  return (
    <span
      data-slot="icon-tile"
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4"
    >
      {props.children}
    </span>
  );
}
