import { PageHeader } from "@genie/core/features/shell";

import { TouchRecord } from "./touch-record.tsx";

export type RecordPageProps = {
  readonly record: { readonly id: string; readonly label: string };
};

/** One record's page. No breadcrumb prop: the trail comes from the route (R-1a). */
export function RecordPage(props: RecordPageProps) {
  return (
    <main>
      <PageHeader title={props.record.label} />
      <p>Record {props.record.id}</p>
      <TouchRecord id={props.record.id} />
    </main>
  );
}
