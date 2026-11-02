"use client";

import { PageHeader } from "@genie/core/features/shell";
import { useModuleClient } from "@genie/core/rpc/client";
import { Button, buttonVariants, Card, CardContent } from "@genie/ui";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { invoicesContract } from "../contract.ts";
import { HistoryTable } from "./allocations.tsx";
import { formatDay, formatMoney, paymentLabel } from "./format.ts";
import {
  INVOICES_QUERY,
  LinkInvoiceDialog,
  RecordLinks,
} from "./link-dialogs.tsx";
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

type ShownView = Extract<PaymentRecordView, { kind: "shown" }>;

function AfterReportingDate(props: {
  readonly view: Exclude<PaymentRecordView, ShownView>;
}) {
  return (
    <main>
      <PageHeader title={props.view.label} />
      <p>
        This payment is dated after the reporting date,{" "}
        {formatDay(props.view.asOf)}, so no balance includes it yet.
      </p>
    </main>
  );
}

/** One payment as of the reporting date: its amounts, its links and their history. */
export function PaymentRecord(props: PaymentRecordProps) {
  const { view } = props;

  return view.kind === "after-reporting-date" ? (
    <AfterReportingDate view={view} />
  ) : (
    <ShownPayment initial={view} />
  );
}

/** The page reads the payment again after each change of a link (decision 4). */
function ShownPayment(props: { readonly initial: ShownView }) {
  const id = props.initial.payment.id;
  const initialData: PaymentRecordView = props.initial;
  const invoices = useModuleClient(invoicesContract);
  const [linking, setLinking] = useState(false);

  const { data: view } = useQuery({
    queryKey: [...INVOICES_QUERY, "payment-record", id],
    queryFn: () => invoices.getPaymentRecord({ id }),
    initialData,
  });

  if (view.kind === "after-reporting-date") {
    return <AfterReportingDate view={view} />;
  }

  const { payment } = view;
  const money = (cents: number) => formatMoney(cents, payment.currency);
  const label = paymentLabel(payment);
  const canLink = view.canWrite && payment.unallocatedCents > 0;

  return (
    <main className="flex flex-col gap-6">
      <PageHeader title={label} />
      <p>Amounts as of {formatDay(view.asOf)}, the reporting date.</p>
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
        {canLink ? (
          <Button variant="secondary" onClick={() => setLinking(true)}>
            Link to an invoice
          </Button>
        ) : null}
      </div>
      {canLink ? (
        <LinkInvoiceDialog
          open={linking}
          payment={{
            id: payment.id,
            customerId: payment.customerId,
            currency: payment.currency,
            label,
            unallocatedCents: payment.unallocatedCents,
          }}
          onClose={() => setLinking(false)}
          onLinked={() => setLinking(false)}
        />
      ) : null}
      <section aria-labelledby="payment-allocations">
        <h2 id="payment-allocations" className="mb-2 font-semibold">
          Allocations
        </h2>
        <RecordLinks
          rows={view.allocations}
          other="invoice"
          canWrite={view.canWrite}
        />
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
