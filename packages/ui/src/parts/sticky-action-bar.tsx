import type { ReactNode } from "react";

import { safeAreaBottom } from "../theme/tokens.ts";

/**
 * The bar a phone shows under a page's content (DESIGN.md: the primary action sits in the sticky
 * bottom bar). It is `md:hidden`, so from 768 px the same action shows inline. The shell reads
 * `data-shell-bottom-bar` to keep the last row of the page clear of the bar. `z-20`: above a list
 * row's `relative z-10` content, which comes later in the page (C12-1).
 */
export function StickyActionBar(props: { readonly children: ReactNode }) {
  return (
    <div
      data-shell-bottom-bar=""
      className={`fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t bg-background px-4 pt-3 ${safeAreaBottom.md} *:flex-1 md:hidden`}
    >
      {props.children}
    </div>
  );
}
