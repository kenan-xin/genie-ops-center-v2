"use client";

import { HelpDisclosure } from "@genie/ui";
import type { ReactNode } from "react";

/** "How access works": the rules both Access tabs rest on (R-37e). */
export function AccessHelp(props: {
  readonly align?: "start" | "end";
}): ReactNode {
  return (
    <HelpDisclosure
      label="How access works"
      {...(props.align === undefined ? {} : { align: props.align })}
    >
      <p>
        Each module has its own roles. Holding any role of a module gives access
        to it. Add gives the module&apos;s default role, and the choice on each
        Granted row changes it.
      </p>
      <p>
        Access adds up. A person reaches a module directly and through each of
        their groups. Removing one path leaves the others, and no rule denies
        access.
      </p>
      <p>A switched-off module keeps its grants and takes no new one.</p>
    </HelpDisclosure>
  );
}
