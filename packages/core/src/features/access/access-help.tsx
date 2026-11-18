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
        Each module has its own roles. Any role of a module gives access to it.
        A module you add gets its default role, and you can pick another role on
        its row.
      </p>
      <p>
        Access adds up. A person has the roles assigned to them and the roles of
        each of their groups. Removing one role leaves the others.
      </p>
      <p>A module that is off keeps its roles, but you cannot add new ones.</p>
    </HelpDisclosure>
  );
}
