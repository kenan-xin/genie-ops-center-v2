import { PageHeader } from "@genie/core/features/shell";
import { Disclosure } from "@genie/ui";

import type { PlaceholderRecordView } from "./__fixtures__/records.ts";

export type WorkspacePageProps = {
  readonly records: readonly PlaceholderRecordView[];
};

export function WorkspacePage(props: WorkspacePageProps) {
  return (
    <main>
      <PageHeader title="Placeholder" />
      {props.records.length === 0 ? (
        <p>No records yet.</p>
      ) : (
        <ul>
          {props.records.map((record) => (
            <li key={record.id}>
              <Disclosure summary={record.label}>{record.detail}</Disclosure>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
