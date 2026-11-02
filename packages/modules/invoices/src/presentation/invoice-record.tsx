"use client";

import { PageHeader } from "@genie/core/features/shell";
import { useModuleClient } from "@genie/core/rpc/client";
import { Button, type Figure, FigureStrip } from "@genie/ui";
import { useQuery } from "@tanstack/react-query";
import { PencilIcon } from "lucide-react";
import { useState } from "react";

import { invoicesContract } from "../contract.ts";
import { formatDay, formatMoney } from "./format.ts";
import { InvoiceStatusBadge } from "./invoice-status-badge.tsx";
import { CorrectTotalDialog, INVOICES_QUERY } from "./link-dialogs.tsx";
import { Fact, OpenPdfLink, RecordBody } from "./record-parts.tsx";
import type { InvoiceDetail, InvoiceRecordView } from "./views.ts";

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

  const { data: view } = useQuery({
    queryKey: [...INVOICES_QUERY, "invoice-record", id],
    queryFn: () => invoices.getInvoiceRecord({ id }),
    initialData,
  });

  if (view.kind === "after-reporting-date") {
    return <AfterReportingDate view={view} />;
  }

  const { invoice } = view;
  const money = (cents: number) => formatMoney(cents, invoice.currency);

  return (
    <main className="flex flex-col gap-6">
      <PageHeader
        title={invoice.invoiceNumber}
        meta={`${invoice.customerName} · Balances as of ${formatDay(view.asOf)}, the reporting date.`}
        secondaryActions={
          view.documentUrl === null && !view.canWrite ? undefined : (
            <>
              {view.documentUrl === null ? null : (
                <OpenPdfLink href={view.documentUrl} />
              )}
              {view.canWrite ? (
                <Button variant="secondary" onClick={() => setCorrecting(true)}>
                  <PencilIcon aria-hidden="true" />
                  Correct the total
                </Button>
              ) : null}
            </>
          )
        }
      />
      <FigureStrip
        label="Figures"
        figures={[
          {
            label: "Outstanding",
            value: money(invoice.outstandingCents),
            lead: true,
            status: <InvoiceStatusBadge status={invoice.status} />,
          },
          { label: "Total", value: money(invoice.totalCents) },
          { label: "Allocated", value: money(invoice.allocatedCents) },
          dueDate(invoice),
        ]}
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
      <RecordBody
        id="invoice"
        other="payment"
        allocations={view.allocations}
        history={view.history}
        canWrite={view.canWrite}
        timeZone={view.timeZone}
        facts={
          <>
            <Fact label="Customer">{invoice.customerName}</Fact>
            <Fact label="Invoice date">{formatDay(invoice.invoiceDate)}</Fact>
            <Fact label="Payment terms">
              {invoice.paymentTerms ?? "None on the document"}
            </Fact>
            <Fact label="Description" wide>
              {invoice.description ?? "None"}
            </Fact>
          </>
        }
      />
    </main>
  );
}
