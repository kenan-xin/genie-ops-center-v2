import { Avatar, AvatarFallback } from "@genie/ui";
import { UsersIcon } from "lucide-react";
import type { ReactNode } from "react";

import { initials } from "../audit/helpers.ts";

/** The leading mark of a person or a group in every Access list and picker (d8l5.65, A-6). */
export function RecipientMark(props: {
  readonly type: "user" | "group";
  readonly name: string;
}): ReactNode {
  return props.type === "user" ? (
    <Avatar aria-hidden="true" data-recipient-mark="user">
      <AvatarFallback>{initials(props.name)}</AvatarFallback>
    </Avatar>
  ) : (
    // The prototype's group tile (.av.g): the avatar's size and tile, with rounded corners.
    <span
      aria-hidden="true"
      data-recipient-mark="group"
      className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-tile text-muted-foreground"
    >
      <UsersIcon aria-hidden="true" className="size-4" />
    </span>
  );
}
