import type { ReactNode } from "react";

export type DeploymentDiagnosticsProps = {
  /** The database this deployment is connected to. One deployment, one database. */
  readonly database: string;
  /** The id of the one process context, so a second context would be visible here. */
  readonly contextId: string;
  /** The module ids compiled into this image, in registry order. */
  readonly modules: readonly string[];
  /** The permission keys the current grant reader returns. */
  readonly permissions: readonly string[];
};

/** One fact, as a term and its description, so a reader reaches it by its label. */
function Fact(props: { readonly label: string; readonly children: ReactNode }) {
  return (
    <>
      <dt>{props.label}</dt>
      <dd>{props.children}</dd>
    </>
  );
}

/** A list of ids, or the sentence that says there are none. */
function Ids(props: {
  readonly values: readonly string[];
  readonly emptyMessage: string;
}) {
  if (props.values.length === 0) return <p>{props.emptyMessage}</p>;

  return (
    <ul>
      {props.values.map((value) => (
        <li key={value}>{value}</li>
      ))}
    </ul>
  );
}

/**
 * The Genie Ops Center devtools panel: what this deployment really is.
 *
 * Every value is passed in by the application, which reads it from the one
 * context. The panel invents nothing. That matters most for identity: Section 0
 * authenticates nobody, so the panel says so instead of rendering a placeholder
 * user, a group, or a role that no code granted.
 */
export function DeploymentDiagnostics(props: DeploymentDiagnosticsProps) {
  return (
    <section>
      <h2>Deployment</h2>
      <dl>
        <Fact label="Database">{props.database}</Fact>
        <Fact label="Context">{props.contextId}</Fact>
        <Fact label="Modules">
          <Ids
            values={props.modules}
            emptyMessage="No modules in this image."
          />
        </Fact>
        <Fact label="Permissions">
          <Ids
            values={props.permissions}
            emptyMessage="No permissions granted."
          />
        </Fact>
        <Fact label="User">
          No user is signed in. Section 0 has no identity yet.
        </Fact>
      </dl>
    </section>
  );
}
