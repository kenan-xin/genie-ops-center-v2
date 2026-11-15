import type { ReactNode } from "react";

/** The unsaved dot of `DESIGN.md` on a staged row, with its hidden words, as Settings marks a section (G15). */
export function UnsavedMark(props: { readonly removal?: boolean }): ReactNode {
  return (
    <>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
      <span className="sr-only">
        {props.removal === true ? " (unsaved removal)" : " (unsaved)"}
      </span>
    </>
  );
}
