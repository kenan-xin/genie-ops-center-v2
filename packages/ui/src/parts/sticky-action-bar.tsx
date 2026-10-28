import type { ReactNode } from "react";

/**
 * The bar a phone shows under a page's content (DESIGN.md: the primary action sits in the sticky
 * bottom bar). It is `md:hidden`, so from 768 px the same action shows inline. The shell reads
 * `data-shell-bottom-bar` to keep the last row of the page clear of the bar.
 */
export function StickyActionBar(props: { readonly children: ReactNode }) {
  return (
    <div
      data-shell-bottom-bar=""
      className="fixed inset-x-0 bottom-0 z-10 flex items-center gap-2 border-t bg-background px-4 py-3 *:flex-1 md:hidden"
    >
      {props.children}
    </div>
  );
}
