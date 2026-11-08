"use client";

import { cn } from "cn";
import * as React from "react";

import { focusRing } from "../theme/tokens.ts";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  const container = React.useRef<HTMLDivElement>(null);

  const [scrolls, setScrolls] = React.useState(false);

  // A table that scrolls sideways takes a tab stop, so a keyboard can scroll it (axe
  // `scrollable-region-focusable`); a table that fits takes none.
  React.useEffect(() => {
    const box = container.current;

    if (box === null) return;

    const measure = () => setScrolls(box.scrollWidth > box.clientWidth);
    const observer = new ResizeObserver(measure);

    observer.observe(box);

    if (box.firstElementChild !== null) observer.observe(box.firstElementChild);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={container}
      data-slot="table-container"
      tabIndex={scrolls ? 0 : undefined}
      className={`relative w-full overflow-x-auto rounded-sm ${focusRing}`}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b [&_tr]:border-border", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-border bg-muted font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-border motion-safe:transition-colors hover:bg-muted has-aria-expanded:bg-muted data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        // A 36 px header row and 14 px row padding (tokens.md "Tables and card lists", czjw.102).
        "bg-muted px-3 py-2.5 text-left align-middle first:pl-5 last:pr-5 text-xs font-semibold whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-3 py-3.5 align-middle first:pl-5 last:pr-5 [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
