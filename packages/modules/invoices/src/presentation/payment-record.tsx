"use client";

import { PageHeader } from "@genie/core/features/shell";
import { buttonVariants, Card, CardContent } from "@genie/ui";
import type { ReactNode } from "react";

import { AllocationTable, HistoryTable } from "./allocations.tsx";
import { formatDay, formatMoney, paymentLabel } from "./format.ts";
import { PaymentStatusBadge } from "./payment-status-badge.tsx";
import type { PaymentRecordView } from "./views.ts";

function Fact(props: { readonly label: string; readonly children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd className="col-span-2">{props.children}</dd>
    </>
  );
}

export type PaymentRecordProps = {
  readonly view: PaymentRecordView;
};

/** One payment as of the reporting date: its amounts, its links and their history. */
export function PaymentRecord(props: PaymentRecordProps) {
  const { view } = props;

  if (view.kind === "after-reporting-date") {
    return (
      <main>
        <PageHeader title={view.label} />
        <p>
          This payment is dated after the reporting date, {view.asOf}, so no
          balance includes it yet.
        </p>
      </main>
    );
  }

  const { payment } = view;
  const money = (cents: number) => formatMoney(cents, payment.currency);

  return (
    <main className="flex flex-col gap-6">
      <PageHeader title={paymentLabel(payment)} />
      <p>Amounts as of {view.asOf}, the reporting date.</p>
      <Card>
        <CardContent>
          <dl className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm">
            <Fact label="Customer">{payment.customerName}</Fact>
            <Fact label="Payment date">{formatDay(payment.paymentDate)}</Fact>
            <Fact label="Reference">{payment.reference ?? "None"}</Fact>
            <Fact label="Method">{payment.method ?? "None"}</Fact>
            <Fact label="Amount">{money(payment.amountCents)}</Fact>
            <Fact label="Allocated">{money(payment.allocatedCents)}</Fact>
            <Fact label="Unallocated">{money(payment.unallocatedCents)}</Fact>
            <Fact label="Status">
              <PaymentStatusBadge status={payment.status} />
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
      <section aria-labelledby="payment-allocations">
        <h2 id="payment-allocations" className="mb-2 font-semibold">
          Allocations
        </h2>
        {view.allocations.length === 0 ? (
          <p>No invoice is linked yet.</p>
        ) : (
          <AllocationTable rows={view.allocations} other="invoice" />
        )}
      </section>
      <section aria-labelledby="payment-history">
        <h2 id="payment-history" className="mb-2 font-semibold">
          History
        </h2>
        {view.history.length === 0 ? (
          <p>No link has changed yet.</p>
        ) : (
          <HistoryTable
            rows={view.history}
            other="invoice"
            timeZone={view.timeZone}
          />
        )}
      </section>
    </main>
  );
}
