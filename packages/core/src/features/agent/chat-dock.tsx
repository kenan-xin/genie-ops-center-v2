"use client";

import { Button, Sheet, SheetContent } from "@genie/ui";
import { MessageCircleIcon } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

/** From this width the chat docks as a column beside the page (redesign choice 2). */
const DOCKED = "(min-width: 1280px)";

function subscribe(onChange: () => void): () => void {
  const query = matchMedia(DOCKED);

  query.addEventListener("change", onChange);

  return () => query.removeEventListener("change", onChange);
}

const isDocked = () => matchMedia(DOCKED).matches;

/**
 * Where a chat panel lives (Section 7 redesign, choice 2): from 1280 px a fixed 400 px column
 * `[data-chat-docked]` at the right, which the shell makes room for; from 768 px a 480 px sheet;
 * below that the whole screen. A 48 px round button "Open <label>" opens it, and Escape or Close
 * hands focus back to that button. Closing only hides the panel, so its conversation survives a
 * reopen. Crossing 1280 px moves the panel between the column and the sheet, which remounts it.
 * `page` marks a page's own chat (`[data-page-chat]`), so the
 * shell hides its general chat button beside it.
 */
export function ChatDock(props: {
  readonly label: string;
  readonly page?: true;
  /** Opens docked on a wide screen, as Dashboards and Slides do. */
  readonly dockedByDefault?: true;
  /** Called each time the chat opens or closes, for example to load its list only once seen. */
  readonly onOpenChange?: ((open: boolean) => void) | undefined;
  readonly children: (close: () => void) => ReactNode;
}): ReactNode {
  const docked = useSyncExternalStore(subscribe, isDocked, () => false);

  const [open, setOpenState] = useState(false);

  const { onOpenChange } = props;

  function setOpen(next: boolean): void {
    setOpenState(next);
    onOpenChange?.(next);
  }

  const trigger = useRef<HTMLButtonElement>(null);

  // Set when the docked column closes, so focus goes back once the button shows again.
  const returnFocus = useRef(false);

  const { dockedByDefault } = props;

  useEffect(() => {
    if (dockedByDefault === true && isDocked()) {
      setOpenState(true);
      onOpenChange?.(true);
    }
    // Only on mount: a later callback identity must not reopen a closed chat.
  }, [dockedByDefault]);

  useEffect(() => {
    if (open || !returnFocus.current) return;

    returnFocus.current = false;
    trigger.current?.focus();
  }, [open]);

  function close(): void {
    returnFocus.current = docked;
    setOpen(false);
  }

  return (
    <div data-page-chat={props.page === true ? "" : undefined}>
      <Button
        ref={trigger}
        type="button"
        size="icon"
        aria-label={`Open ${props.label}`}
        hidden={open && docked}
        // oxlint-disable-next-line shadcn/no-restyle -- the round 48 px chat button of the redesign (choice 5)
        className="fixed right-4 bottom-20 z-40 size-12 rounded-full shadow-lg lg:right-6 lg:bottom-6"
        onClick={() => setOpen(true)}
      >
        <MessageCircleIcon aria-hidden="true" strokeWidth={1.75} />
      </Button>
      {/* Both stay mounted while closed: a chat keeps its session and its streamed answer. */}
      {docked ? (
        <aside
          data-chat-docked={open ? "" : undefined}
          aria-label={props.label}
          hidden={!open}
          className="fixed inset-y-0 right-0 z-30 w-100 border-s border-border bg-background"
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
        >
          {props.children(close)}
        </aside>
      ) : (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            side="right"
            showCloseButton={false}
            keepMounted
            aria-label={props.label}
            // oxlint-disable-next-line shadcn/no-restyle -- the panel brings its own header and padding
            className="gap-0 overflow-hidden p-0"
          >
            {props.children(close)}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
