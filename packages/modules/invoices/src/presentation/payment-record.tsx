"use client";

import { PageHeader } from "@genie/core/features/shell";
import { useModuleClient } from "@genie/core/rpc/client";
import { Button, type Figure, FigureStrip } from "@genie/ui";
import { useQuery } from "@tanstack/react-query";
import { LinkIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { invoicesContract } from "../contract.ts";
import { DocumentDesk } from "./document-desk.tsx";
import { formatDay, formatMoney, paymentLabel } from "./format.ts";
import { INVOICES_QUERY, LinkInvoiceDialog } from "./link-dialogs.tsx";
import { PaymentStatusBadge } from "./payment-status-badge.tsx";
import { paymentDeskFields } from "./record-fields.ts";
import { RecordSide } from "./record-parts.tsx";
import type { PaymentRecordView } from "./views.ts";

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

  const query = useQuery({
    queryKey: [...INVOICES_QUERY, "payment-record", id],
    queryFn: () => invoices.getPaymentRecord({ id }),
    initialData,
  });

  const view = query.data;

  // Memoised: a new array would draw the page's text layer again.
  const fields = useMemo(
    () =>
      view.kind === "shown"
        ? paymentDeskFields(
            view.payment,
            view.fields,
            view.documentUrl !== null
          )
        : [],
    [view]
  );

  if (view.kind === "after-reporting-date") {
    return <AfterReportingDate view={view} />;
  }

  const { payment } = view;
  const money = (cents: number) => formatMoney(cents, payment.currency);
  const label = paymentLabel(payment);
  const canLink = view.canWrite && payment.unallocatedCents > 0;

  const status = <PaymentStatusBadge status={payment.status} />;
  const amount = { label: "Amount", value: money(payment.amountCents) };

  // Choice 11: unallocated money leads; with none, the amount leads.
  const lead: readonly Figure[] =
    payment.unallocatedCents > 0
      ? [
          {
            label: "Unallocated",
            value: money(payment.unallocatedCents),
            lead: true,
            status,
          },
          amount,
        ]
      : [{ ...amount, lead: true, status }];

  const unallocated = payment.unallocatedCents > 0;

  const refreshUrl = async () => {
    const answer = await query.refetch();

    return answer.data?.kind === "shown" ? answer.data.documentUrl : null;
  };

  const linkAction = canLink ? (
    <Button variant="secondary" size="sm" onClick={() => setLinking(true)}>
      <LinkIcon aria-hidden="true" />
      Link to an invoice
    </Button>
  ) : undefined;

  const meta = `${payment.customerName} · Amounts as of ${formatDay(view.asOf)}, the reporting date.`;

  return (
    <main>
      <DocumentDesk
        kind="payment"
        label={label}
        documentUrl={view.documentUrl}
        refreshUrl={refreshUrl}
        fields={fields}
        header={<PageHeader title={label} meta={meta} compactBelowLg />}
        sheetHeader={<p className="text-sm text-muted-foreground">{meta}</p>}
        figures={
          <FigureStrip
            label="Figures"
            figures={[
              ...lead,
              { label: "Allocated", value: money(payment.allocatedCents) },
              { label: "Payment date", value: formatDay(payment.paymentDate) },
            ]}
          />
        }
        peek={{
          status,
          caption: `${unallocated ? "Unallocated" : "Amount"} · ${payment.customerName}`,
          amount: money(
            unallocated ? payment.unallocatedCents : payment.amountCents
          ),
        }}
        side={(place) => (
          <RecordSide
            id="payment"
            other="invoice"
            allocations={view.allocations}
            history={view.history}
            canWrite={view.canWrite}
            timeZone={view.timeZone}
            linkAction={linkAction}
            layout={place === "drawer" ? "cards" : "auto"}
          />
        )}
      />
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
    </main>
  );
}
