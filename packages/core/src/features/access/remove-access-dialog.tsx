"use client";

import { ConfirmDialog } from "@genie/ui";
import { type ReactNode, useId } from "react";

import type { AccessPath } from "../../services/roles/effective-access.ts";

export type RowRemoval = {
  readonly rowName: string;
  /** Each direct assignment that the Remove takes. */
  readonly rolesThatGo: readonly AccessPath[];
  /** Each other path that keeps the row (the screen computes them, P6). */
  readonly pathsThatStay: readonly AccessPath[];
};

type Recipient = { readonly type: "user" | "group"; readonly name: string };

const goesAs = (path: AccessPath) =>
  path.scope === null ? "Direct assignment" : "Direct assignment, one record";

const staysAs = (path: AccessPath) =>
  path.holder.type === "group"
    ? `Through ${path.holder.name}`
    : "Direct assignment";

function PathList(props: {
  readonly heading: string;
  readonly level: "h3" | "h4";
  readonly paths: readonly AccessPath[];
  readonly detail: (path: AccessPath) => string;
}) {
  const id = useId();

  const Heading = props.level;

  return (
    <div className="flex flex-col gap-1">
      <Heading
        id={id}
        className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        {props.heading}
      </Heading>
      <ul aria-labelledby={id} className="flex flex-col gap-1">
        {props.paths.map((path) => (
          <li key={path.assignmentId} className="flex flex-col">
            <span className="font-medium">{path.role.name}</span>
            <span className="text-xs text-muted-foreground">
              {props.detail(path)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function noPathSentence(recipient: Recipient, row: string): string {
  return recipient.type === "user"
    ? `${recipient.name} holds no other role of ${row}. After you save, ${recipient.name} no longer reaches ${row}.`
    : `${recipient.name} holds no role of ${row} after you save. Members who reach ${row} directly or through another group keep that path.`;
}

/**
 * The confirmation that every Remove opens before Save (R-37a, AC-28). It names each direct role
 * that goes and each path that keeps the module, or says that the recipient loses the module.
 */
export function RemoveAccessDialog(props: {
  readonly open: boolean;
  readonly recipient: Recipient;
  readonly removals: readonly RowRemoval[];
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}): ReactNode {
  const several = props.removals.length > 1;

  const [first] = props.removals;

  const title =
    several || first === undefined
      ? `Remove ${props.removals.length} modules from ${props.recipient.name}?`
      : `Remove ${first.rowName} from ${props.recipient.name}?`;

  const roleCount = props.removals.reduce(
    (sum, removal) => sum + removal.rolesThatGo.length,
    0
  );

  const description = props.removals.some(
    (removal) => removal.pathsThatStay.length > 0
  )
    ? `The direct ${roleCount === 1 ? "role goes" : "roles go"}. Access continues through the paths that stay.`
    : "The roles below go when you save.";

  const level = several ? "h4" : "h3";

  return (
    <ConfirmDialog
      open={props.open}
      title={title}
      description={description}
      confirmLabel="Remove and save"
      danger
      onConfirm={props.onConfirm}
      onClose={props.onClose}
    >
      <div className="flex flex-col gap-4">
        {props.removals.map((removal) => (
          <section key={removal.rowName} className="flex flex-col gap-3">
            {several ? (
              <h3 className="text-sm font-semibold">{removal.rowName}</h3>
            ) : null}
            <PathList
              heading="Roles that go"
              level={level}
              paths={removal.rolesThatGo}
              detail={goesAs}
            />
            {removal.pathsThatStay.length > 0 ? (
              <PathList
                heading="Paths that stay"
                level={level}
                paths={removal.pathsThatStay}
                detail={staysAs}
              />
            ) : (
              <p className="text-muted-foreground">
                {noPathSentence(props.recipient, removal.rowName)}
              </p>
            )}
          </section>
        ))}
      </div>
    </ConfirmDialog>
  );
}
