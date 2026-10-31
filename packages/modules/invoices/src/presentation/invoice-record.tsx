"use client";

import { PageHeader } from "@genie/core/features/shell";
import { useModuleClient } from "@genie/core/rpc/client";
import { Button, buttonVariants, Card, CardContent } from "@genie/ui";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { invoicesContract } from "../contract.ts";
import { HistoryTable } from "./allocations.tsx";
import { formatDay, formatMoney } from "./format.ts";
import { InvoiceStatusBadge } from "./invoice-status-badge.tsx";
import {
  CorrectTotalDialog,
  INVOICES_QUERY,
  RecordLinks,
} from "./link-dialogs.tsx";
import type { InvoiceDetail, InvoiceRecordView } from "./views.ts";

const DUE_DATE_SOURCE: Record<InvoiceDetail["dueDateSource"], string> = {
  document: "From the document",
  person: "Entered by a person",
  unspecified: "No due date",
};

function dueDate(invoice: InvoiceDetail): ReactNode {
  if (invoice.dueDate === null) return DUE_DATE_SOURCE.unspecified;

  return (
    <>
      {formatDay(invoice.dueDate)}
      <span className="block text-muted-foreground">
        {DUE_DATE_SOURCE[invoice.dueDateSource]}
      </span>
    </>
  );
}

function Fact(props: { readonly label: string; readonly children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd className="col-span-2">{props.children}</dd>
    </>
  );
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
        This invoice is dated after the reporting date, {props.view.asOf}, so no
        balance includes it yet.
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
      <PageHeader title={invoice.invoiceNumber} />
      <p>Balances as of {view.asOf}, the reporting date.</p>
      <Card>
        <CardContent>
          <dl className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
            <Fact label="Customer">{invoice.customerName}</Fact>
            <Fact label="Invoice date">{formatDay(invoice.invoiceDate)}</Fact>
            <Fact label="Due date">{dueDate(invoice)}</Fact>
            <Fact label="Payment terms">{invoice.paymentTerms ?? "None"}</Fact>
            <Fact label="Description">{invoice.description ?? "None"}</Fact>
            <Fact label="Total">{money(invoice.totalCents)}</Fact>
            <Fact label="Allocated">{money(invoice.allocatedCents)}</Fact>
            <Fact label="Outstanding">{money(invoice.outstandingCents)}</Fact>
            <Fact label="Status">
              <InvoiceStatusBadge status={invoice.status} />
            </Fact>
          </dl>
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        {view.documentUrl === null ? null : (
          <a
            href={view.documentUrl}
            target="_blank"
            rel="noopener"
            className={buttonVariants({ variant: "secondary" })}
          >
            Open the source document (PDF)
          </a>
        )}
        {view.canWrite ? (
          <Button variant="secondary" onClick={() => setCorrecting(true)}>
            Correct the total
          </Button>
        ) : null}
      </div>
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
      <section aria-labelledby="invoice-allocations">
        <h2 id="invoice-allocations" className="mb-2 font-semibold">
          Allocations
        </h2>
        <RecordLinks
          rows={view.allocations}
          other="payment"
          canWrite={view.canWrite}
        />
      </section>
      <section aria-labelledby="invoice-history">
        <h2 id="invoice-history" className="mb-2 font-semibold">
          History
        </h2>
        {view.history.length === 0 ? (
          <p>No link has changed yet.</p>
        ) : (
          <HistoryTable
            rows={view.history}
            other="payment"
            timeZone={view.timeZone}
          />
        )}
      </section>
    </main>
  );
}
