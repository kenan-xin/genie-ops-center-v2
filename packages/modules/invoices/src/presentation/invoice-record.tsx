"use client";

import { PageHeader } from "@genie/core/features/shell";
import { useModuleClient } from "@genie/core/rpc/client";
import { Button, type Figure, FigureStrip } from "@genie/ui";
import { useQuery } from "@tanstack/react-query";
import { PencilIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { invoicesContract } from "../contract.ts";
import { DocumentDesk } from "./document-desk.tsx";
import { formatDay, formatMoney } from "./format.ts";
import { InvoiceStatusBadge } from "./invoice-status-badge.tsx";
import { CorrectTotalDialog, INVOICES_QUERY } from "./link-dialogs.tsx";
import { invoiceDeskFields } from "./record-fields.ts";
import { RecordSide } from "./record-parts.tsx";
import type { InvoiceDetail, InvoiceRecordView, RecordField } from "./views.ts";

/** The note of a figure that a field backs: where its value came from (R-38a). */
const ORIGIN_NOTE: Record<RecordField["origin"], string> = {
  extracted: "Extracted",
  corrected: "Corrected by you",
  entered: "Entered by you",
};

const DUE_DATE_SOURCE: Record<
  Exclude<InvoiceDetail["dueDateSource"], "unspecified">,
  string
> = {
  document: "From the document",
  person: "Entered by a person",
};

function dueDate(invoice: InvoiceDetail): Figure {
  return invoice.dueDate === null || invoice.dueDateSource === "unspecified"
    ? { label: "Due date", value: "None" }
    : {
        label: "Due date",
        value: formatDay(invoice.dueDate),
        note: DUE_DATE_SOURCE[invoice.dueDateSource],
      };
}

export type InvoiceRecordProps = {
  readonly view: InvoiceRecordView;
};

type ShownView = Extract<InvoiceRecordView, { kind: "shown" }>;

function AfterReportingDate(props: {
  readonly view: Exclude<InvoiceRecordView, ShownView>;
}) {
  return (
    <main>
      <PageHeader title={props.view.label} />
      <p>
        This invoice is dated after the reporting date,{" "}
        {formatDay(props.view.asOf)}, so no balance includes it yet.
      </p>
    </main>
  );
}

/** One invoice as of the reporting date: its facts, its balance, its links and their history. */
export function InvoiceRecord(props: InvoiceRecordProps) {
  const { view } = props;

  return view.kind === "after-reporting-date" ? (
    <AfterReportingDate view={view} />
  ) : (
    <ShownInvoice initial={view} />
  );
}

/** The page reads the invoice again after each change of a link (decision 4). */
function ShownInvoice(props: { readonly initial: ShownView }) {
  const id = props.initial.invoice.id;
  const initialData: InvoiceRecordView = props.initial;
  const invoices = useModuleClient(invoicesContract);
  const [correcting, setCorrecting] = useState(false);

  const query = useQuery({
    queryKey: [...INVOICES_QUERY, "invoice-record", id],
    queryFn: () => invoices.getInvoiceRecord({ id }),
    initialData,
  });

  const view = query.data;

  // Memoised: a new array would draw the page's text layer again.
  const fields = useMemo(
    () =>
      view.kind === "shown"
        ? invoiceDeskFields(
            view.invoice,
            view.fields,
            view.documentUrl !== null
          )
        : [],
    [view]
  );

  if (view.kind === "after-reporting-date") {
    return <AfterReportingDate view={view} />;
  }

  const { invoice } = view;
  const money = (cents: number) => formatMoney(cents, invoice.currency);
  const status = <InvoiceStatusBadge status={invoice.status} />;
  const linked = view.allocations.length;

  const totalOrigin =
    view.documentUrl === null
      ? "entered"
      : view.fields.find((row) => row.field === "amount")?.origin;

  const refreshUrl = async () => {
    const answer = await query.refetch();

    return answer.data?.kind === "shown" ? answer.data.documentUrl : null;
  };

  return (
    <main>
      <DocumentDesk
        kind="invoice"
        label={invoice.invoiceNumber}
        documentUrl={view.documentUrl}
        refreshUrl={refreshUrl}
        fields={fields}
        header={
          <PageHeader
            title={invoice.invoiceNumber}
            meta={`${invoice.customerName} · Balances as of ${formatDay(view.asOf)}, the reporting date.`}
            secondaryActions={
              view.canWrite ? (
                <Button variant="secondary" onClick={() => setCorrecting(true)}>
                  <PencilIcon aria-hidden="true" />
                  Correct the total
                </Button>
              ) : undefined
            }
          />
        }
        figures={
          <FigureStrip
            label="Figures"
            figures={[
              {
                label: "Outstanding",
                value: money(invoice.outstandingCents),
                lead: true,
                status,
              },
              totalOrigin === undefined
                ? { label: "Total", value: money(invoice.totalCents) }
                : {
                    label: "Total",
                    value: money(invoice.totalCents),
                    note: ORIGIN_NOTE[totalOrigin],
                  },
              {
                label: "Paid",
                value: money(invoice.allocatedCents),
                note: `${linked} ${linked === 1 ? "payment" : "payments"} linked`,
              },
              dueDate(invoice),
            ]}
          />
        }
        peek={{
          status,
          caption: `Outstanding · ${invoice.customerName}`,
          amount: money(invoice.outstandingCents),
        }}
        side={(place) => (
          <RecordSide
            id="invoice"
            other="payment"
            allocations={view.allocations}
            history={view.history}
            canWrite={view.canWrite}
            timeZone={view.timeZone}
            layout={place === "drawer" ? "cards" : "auto"}
          />
        )}
      />
      {view.canWrite ? (
        <CorrectTotalDialog
          open={correcting}
          invoice={{
            id: invoice.id,
            number: invoice.invoiceNumber,
            currency: invoice.currency,
            totalCents: invoice.totalCents,
          }}
          allocations={view.allocations}
          onClose={() => setCorrecting(false)}
          onCorrected={() => setCorrecting(false)}
        />
      ) : null}
    </main>
  );
}
