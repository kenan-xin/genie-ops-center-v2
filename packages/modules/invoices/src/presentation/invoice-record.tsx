"use client";

import { PageHeader } from "@genie/core/features/shell";
import { buttonVariants, Card, CardContent } from "@genie/ui";
import type { ReactNode } from "react";

import { AllocationTable, HistoryTable } from "./allocations.tsx";
import { formatDay, formatMoney } from "./format.ts";
import { InvoiceStatusBadge } from "./invoice-status-badge.tsx";
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

/** One invoice as of the reporting date: its facts, its balance, its links and their history. */
export function InvoiceRecord(props: InvoiceRecordProps) {
  const { view } = props;

  if (view.kind === "after-reporting-date") {
    return (
      <main>
        <PageHeader title={view.label} />
        <p>
          This invoice is dated after the reporting date, {view.asOf}, so no
          balance includes it yet.
        </p>
      </main>
    );
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
      <section aria-labelledby="invoice-allocations">
        <h2 id="invoice-allocations" className="mb-2 font-semibold">
          Allocations
        </h2>
        {view.allocations.length === 0 ? (
          <p>No payment is linked yet.</p>
        ) : (
          <AllocationTable rows={view.allocations} other="payment" />
        )}
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
