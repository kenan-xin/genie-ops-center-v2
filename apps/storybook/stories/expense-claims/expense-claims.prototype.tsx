import {
  AppShell,
  PageHeader,
  type ShellLinkComponent,
  type ShellNavigation,
  type ShellStrings,
} from "@genie/core/features/shell";
import {
  Button,
  DataTable,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Field,
  FieldLabel,
  FieldDescription,
  Input,
  Textarea,
  StatusPill,
  LabelPill,
  InfoNote,
  WarningNote,
  focusRing,
} from "@genie/ui";
import { createContext, use, useEffect, useReducer, useState } from "react";

import {
  claimReducer,
  initialState,
  samples,
  money,
  stageLabel,
  editable,
  inApproverInbox,
  limit,
  type Claim,
  type Action,
  type State,
} from "./expense-claims-model.prototype.ts";

const Navigate = createContext<(path: string) => void>(() => {});

const PrototypeLink: ShellLinkComponent = ({ href, children, ...props }) => {
  const navigate = use(Navigate);

  return (
    <a
      {...props}
      href={`#${href}`}
      onClick={(e) => {
        e.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  );
};

const navigation: ShellNavigation = {
  workspace: [
    { id: "core-ask", label: "Ask", href: "/ask" },
    {
      id: "analytics",
      label: "Dashboards",
      href: "/m/analytics",
      icon: "layout-dashboard",
    },
    { id: "slides", label: "Slides", href: "/m/slides", icon: "presentation" },
  ],
  pinned: [],
  categories: [
    {
      id: "expenses",
      name: "Expenses",
      entries: [
        {
          id: "approvals",
          label: "Approvals",
          href: "/m/expenses/approvals",
          icon: "inbox",
        },
        {
          id: "my-claims",
          label: "My claims",
          href: "/m/expenses/claims",
          icon: "receipt",
        },
      ],
    },
    {
      id: "finance",
      name: "Invoices and Payments",
      entries: [
        {
          id: "invoices-documents",
          label: "Documents",
          href: "/m/invoices/documents",
          icon: "inbox",
        },
        {
          id: "invoices-invoices",
          label: "Invoices",
          href: "/m/invoices/invoices",
          icon: "receipt",
        },
        {
          id: "invoices-payments",
          label: "Payments",
          href: "/m/invoices/payments",
          icon: "banknote",
        },
      ],
    },
  ],
  admin: [],
};

const strings: ShellStrings = {
  workspace: "Workspace",
  adminPortal: "Admin portal",
  pinned: "Pinned",
  categories: "Categories",
  navigation: "Navigation",
  openNavigation: "Open navigation",
  closeNavigation: "Close navigation",
  collapseMenu: "Collapse menu",
  expandMenu: "Expand menu",
  menuShortcut: "Ctrl B",
  backTo: "Back to {page}",
  offline: "You are offline.",
  pageContent: "Page content",
  account: "Account",
  ask: "Ask",
  changePassword: "Change password",
  opensInNewTab: "Opens in a new tab",
  helpAndSupport: "Help and support",
  signOut: "Sign out",
};

const previewPages = new Map([
  [
    "/m/invoices/documents",
    { title: "Documents", story: "modules-invoices-documents-inbox--default" },
  ],
  [
    "/m/invoices/invoices",
    { title: "Invoices", story: "modules-invoices-invoices-list--default" },
  ],
  [
    "/m/invoices/payments",
    { title: "Payments", story: "modules-invoices-payments-list--default" },
  ],
  [
    "/m/analytics",
    {
      title: "Dashboards",
      story: "modules-analytics-dashboards-list--default",
    },
  ],
  [
    "/m/slides",
    { title: "Slides", story: "modules-slides-decks-list--default" },
  ],
]);

const dateText = (date: string) =>
  date
    ? new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "Not found";

function ClaimStatus({ claim }: { claim: Claim }) {
  return (
    <StatusPill
      tone={
        claim.stage === "approved"
          ? "success"
          : claim.stage === "rejected"
            ? "danger"
            : ["needs-info", "returned"].includes(claim.stage)
              ? "warning"
              : "neutral"
      }
    >
      {stageLabel[claim.stage]}
    </StatusPill>
  );
}

function Receipt({ claim }: { claim: Claim }) {
  const original = samples[claim.key];

  return (
    <section
      aria-label="Source receipt"
      className="space-y-4 border-t border-border pt-5 xl:border-t-0 xl:border-l xl:pl-6 xl:pt-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Attached receipt</h3>
        <LabelPill>Sample PDF</LabelPill>
      </div>
      <div className="space-y-6 rounded-lg border border-border bg-background p-6 text-sm">
        <div className="text-center">
          <p className="text-lg font-semibold">{original.merchant}</p>
          <p className="text-muted-foreground">
            {original.category === "Meals" ? "Dining receipt" : "Trip receipt"}
          </p>
        </div>
        <dl className="space-y-3 border-y border-border py-4">
          <div className="flex justify-between gap-4">
            <dt>Receipt</dt>
            <dd>{original.id}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Date</dt>
            <dd>{dateText(original.date)}</dd>
          </div>
        </dl>
        <p>{original.purpose}</p>
        <div className="flex justify-between gap-4 border-t border-border pt-4 font-semibold">
          <span>Total paid</span>
          <span className="tabular-nums">{money(original.cents)}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Fictional receipt · no real file uploaded
        </p>
      </div>
      <p className="break-words text-xs text-muted-foreground">
        {claim.file} · Original receipt; corrections are saved on the claim.
      </p>
    </section>
  );
}

function ClaimEditor({
  claim,
  approver,
  dispatch,
}: {
  claim: Claim;
  approver: boolean;
  dispatch: (a: Action) => void;
}) {
  const [date, setDate] = useState(claim.date),
    [purpose, setPurpose] = useState(claim.purpose),
    [note, setNote] = useState("");

  const canEdit = !approver && editable(claim);

  return (
    <article className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {claim.merchant} · {money(claim.cents)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {claim.id} · Alex Tan · Sales · {claim.category}
          </p>
        </div>
        <ClaimStatus claim={claim} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className={approver ? "" : "order-last xl:order-first"}>
          <Receipt claim={claim} />
        </div>
        <div className="min-w-0 space-y-5">
          {canEdit ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                dispatch({
                  type: "submit",
                  id: claim.id,
                  date,
                  purpose,
                  actor: "employee",
                });
              }}
            >
              <div className="space-y-1">
                <h3 className="text-base font-semibold">
                  {claim.stage === "draft"
                    ? "Check your claim"
                    : "Update your claim"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {claim.stage === "returned"
                    ? "Read Morgan’s note, make your changes, then resubmit."
                    : "Confirm the receipt date and explain the business expense."}
                </p>
              </div>
              {claim.stage === "returned" && claim.decision && (
                <WarningNote>{claim.decision}</WarningNote>
              )}
              <Field>
                <FieldLabel htmlFor="claim-date">Receipt date</FieldLabel>
                <Input
                  id="claim-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                <FieldDescription>
                  {claim.date
                    ? `${claim.origin}. Correct it if needed.`
                    : "Missing from the receipt. Enter the date to send this claim for approval."}
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="claim-purpose">
                  Business purpose
                </FieldLabel>
                <Textarea
                  id="claim-purpose"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  maxLength={500}
                />
                <FieldDescription>
                  Include the meeting, trip or attendees this expense was for.
                </FieldDescription>
              </Field>
              <div className="flex items-center justify-between border-t border-border pt-4 text-sm">
                <span>Claim amount</span>
                <strong className="tabular-nums">{money(claim.cents)}</strong>
              </div>
              <Button type="submit" className="min-h-11 w-full sm:w-auto">
                {claim.stage === "draft" ? "Submit claim" : "Resubmit claim"}
              </Button>
              <p className="text-xs text-muted-foreground">
                AI checks the claim first. Morgan Lee makes the final decision.
              </p>
            </form>
          ) : (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Business purpose</dt>
                <dd>{claim.purpose || "Not provided"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Receipt date</dt>
                <dd>
                  {dateText(claim.date)} · {claim.origin}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Assigned approver</dt>
                <dd>Morgan Lee · Finance manager</dd>
              </div>
            </dl>
          )}
          {claim.stage !== "draft" && (
            <section
              aria-label="AI pre-check"
              className="space-y-3 border-t border-border pt-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold">AI pre-check</h3>
                <LabelPill>Simulated</LabelPill>
              </div>
              {claim.stage === "checking" ? (
                <InfoNote role="status">
                  Checking receipt facts, duplicate submission and policy
                  limits… This claim is not in the approval queue yet.
                </InfoNote>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Receipt attached · no duplicate sample ·{" "}
                    {money(limit(claim))} category limit
                  </p>
                  {claim.checks.length ? (
                    claim.checks.map((check) => (
                      <WarningNote key={check}>{check}</WarningNote>
                    ))
                  ) : (
                    <InfoNote>
                      {claim.stage === "approved"
                        ? "No issues found during the pre-check."
                        : claim.stage === "rejected"
                          ? "Pre-check passed; Morgan rejected this claim."
                          : "Pre-check passed. Morgan makes the final decision."}
                    </InfoNote>
                  )}
                </>
              )}
            </section>
          )}
          {claim.decision && !(canEdit && claim.stage === "returned") && (
            <InfoNote>
              <p className="font-semibold">Morgan’s last decision note</p>
              <p>{claim.decision}</p>
            </InfoNote>
          )}
          {approver && claim.stage === "pending" && (
            <section
              aria-label="Final decision"
              className="space-y-4 border-t border-border pt-4"
            >
              <h3 className="text-base font-semibold">Your decision</h3>
              <p className="text-sm text-muted-foreground">
                {claim.cents > limit(claim)
                  ? "You may approve this exception with an explanation. The policy warning will remain in the record."
                  : "The pre-check found no blockers. You make the final decision."}
              </p>
              <Field>
                <FieldLabel htmlFor="decision-note">
                  Decision note
                  {claim.cents > limit(claim) ? " (required for approval)" : ""}
                </FieldLabel>
                <Textarea
                  id="decision-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                />
                <FieldDescription>
                  Required when returning or rejecting any claim.
                </FieldDescription>
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    dispatch({
                      type: "decision",
                      id: claim.id,
                      decision: "approved",
                      note,
                      actor: "approver",
                    })
                  }
                >
                  Approve {money(claim.cents)}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    dispatch({
                      type: "decision",
                      id: claim.id,
                      decision: "returned",
                      note,
                      actor: "approver",
                    })
                  }
                >
                  Return for changes
                </Button>
                <Button
                  variant="danger-outline"
                  onClick={() =>
                    dispatch({
                      type: "decision",
                      id: claim.id,
                      decision: "rejected",
                      note,
                      actor: "approver",
                    })
                  }
                >
                  Reject claim
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Approval records the decision only. No payment is made.
              </p>
            </section>
          )}
          {claim.stage === "approved" && (
            <InfoNote>
              Approved by Morgan Lee for {money(claim.cents)}. Reimbursement has
              not been paid.
            </InfoNote>
          )}
        </div>
      </div>
      <details className="border-t border-border pt-4">
        <summary
          className={`cursor-pointer text-sm font-semibold ${focusRing}`}
        >
          Claim history ({claim.history.length})
        </summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          {claim.history.map((line, i) => (
            <li key={`${i}-${line}`}>{line}</li>
          ))}
        </ol>
      </details>
    </article>
  );
}

function nextStep(claim: Claim) {
  switch (claim.stage) {
    case "draft":
      return "Complete and submit";
    case "checking":
      return "Checking receipt and policy";
    case "needs-info":
      return !claim.date ? "Add receipt date" : "Add business purpose";
    case "returned":
      return "Read note and update claim";
    case "pending":
      return claim.checks.length
        ? "Exception with Morgan for review"
        : "With Morgan for approval";
    case "approved":
      return "Approved · not yet paid";
    case "rejected":
      return "Read Morgan’s decision";
  }
}

function EmployeeClaims({
  state,
  dispatch,
}: {
  state: State;
  dispatch: (action: Action) => void;
}) {
  const [view, setView] = useState<"list" | "new" | "detail">("list");
  const claim = state.claims.find((item) => item.id === state.selected);

  const groups = [
    { id: "all", label: "All claims", rows: state.claims },
    {
      id: "attention",
      label: "Needs attention",
      rows: state.claims.filter(editable),
    },
    {
      id: "progress",
      label: "In progress",
      rows: state.claims.filter((item) =>
        ["checking", "pending"].includes(item.stage)
      ),
    },
    {
      id: "done",
      label: "Completed",
      rows: state.claims.filter((item) =>
        ["approved", "rejected"].includes(item.stage)
      ),
    },
  ];

  const openClaim = (item: Claim) => {
    dispatch({ type: "select", id: item.id });
    setView("detail");
  };

  return (
    <div className="space-y-6 pb-20 md:pb-6">
      <div hidden={view !== "list"} className="space-y-6">
        {view === "list" && (
          <PageHeader
            title="My claims"
            description="Your expenses, from submission to decision."
            actions={<Button onClick={() => setView("new")}>New claim</Button>}
          />
        )}
        <Tabs defaultValue="all">
          <div className="overflow-x-auto border-b border-border">
            <TabsList>
              {groups.map((group) => (
                <TabsTrigger key={group.id} value={group.id}>
                  {group.label} ({group.rows.length})
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {groups.map((group) => (
            <TabsContent key={group.id} value={group.id}>
              {group.rows.length ? (
                <DataTable<Claim>
                  label={`${group.label} — Alex Tan`}
                  rows={group.rows}
                  rowKey={(item) => item.id}
                  rowLabel={(item) => `${item.merchant} ${item.id}`}
                  columns={[
                    {
                      id: "claim",
                      header: "Expense",
                      cell: (item) => (
                        <div className="space-y-1">
                          <span className="font-semibold">{item.merchant}</span>
                          <span className="block text-xs text-muted-foreground">
                            {item.id} · {item.category}
                          </span>
                        </div>
                      ),
                    },
                    {
                      id: "date",
                      header: "Receipt date",
                      cell: (item) => dateText(item.date),
                    },
                    {
                      id: "amount",
                      header: "Amount",
                      align: "end",
                      cell: (item) => (
                        <span className="font-semibold tabular-nums">
                          {money(item.cents)}
                        </span>
                      ),
                    },
                    { id: "next", header: "Next step", cell: nextStep },
                  ]}
                  status={(item) => <ClaimStatus claim={item} />}
                  card={{
                    title: (item) => item.merchant,
                    detail: (item) => `${item.id} · ${dateText(item.date)}`,
                    badge: (item) => <ClaimStatus claim={item} />,
                    facts: (item) => [nextStep(item)],
                    trailing: (item) => (
                      <span className="font-semibold tabular-nums">
                        {money(item.cents)}
                      </span>
                    ),
                  }}
                  onOpenRow={openClaim}
                />
              ) : (
                <div className="space-y-2 border-b border-border py-12 text-center">
                  <h2 className="font-semibold">
                    {group.id === "attention"
                      ? "Nothing needs your attention"
                      : group.id === "done"
                        ? "No decisions yet"
                        : "No claims here yet"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {group.id === "done"
                      ? "Approved and rejected claims appear here after review."
                      : "Use All claims to see your expenses, or start a new claim."}
                  </p>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
        <p className="text-xs text-muted-foreground">
          Claims for Alex Tan · Amounts in SGD · Approval does not mean
          reimbursement has been paid.
        </p>
      </div>
      {view !== "list" && (
        <>
          <Button variant="ghost" onClick={() => setView("list")}>
            Back to my claims
          </Button>
          {view === "new" ? (
            <div className="mx-auto max-w-2xl space-y-6">
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold">New claim</h1>
                <p className="text-sm text-muted-foreground">
                  Start with a receipt, then confirm the expense details.
                </p>
              </div>
              <section
                className="space-y-4 rounded-xl border border-border p-6"
                aria-label="Choose a sample receipt"
              >
                <div className="space-y-1">
                  <h2 className="font-semibold">Choose a sample receipt</h2>
                  <p className="text-sm text-muted-foreground">
                    This prototype uses fictional receipts instead of file
                    uploads.
                  </p>
                </div>
                {(["taxi", "meal", "missing"] as const).map((key) => (
                  <Button
                    key={key}
                    variant="secondary"
                    className="h-auto min-h-14 w-full justify-between whitespace-normal py-3 text-left"
                    onClick={() => {
                      const existing = state.claims.find(
                        (item) => item.key === key
                      );

                      if (existing)
                        dispatch({ type: "select", id: existing.id });
                      else dispatch({ type: "add", key });
                      setView("detail");
                    }}
                  >
                    <span>
                      {samples[key].merchant}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {samples[key].file} ·{" "}
                        {state.claims.some((item) => item.key === key)
                          ? "Open existing claim"
                          : samples[key].date
                            ? samples[key].category
                            : "Missing receipt date"}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {money(samples[key].cents)}
                    </span>
                  </Button>
                ))}
              </section>
              <p className="text-xs text-muted-foreground">
                Demo policy: meals up to SGD 80; transport up to SGD 60.
                Exceptions need an approver’s explanation.
              </p>
            </div>
          ) : (
            claim && (
              <div className="mx-auto max-w-5xl space-y-5">
                <p role="status" className="text-sm text-muted-foreground">
                  {nextStep(claim)}
                </p>
                <ClaimEditor
                  key={`${claim.id}-${claim.stage}`}
                  claim={claim}
                  approver={false}
                  dispatch={dispatch}
                />
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}

export function ExpenseClaimsPrototype() {
  const [state, dispatch] = useReducer(claimReducer, undefined, () => {
    const demo = claimReducer(initialState(), { type: "demo" });

    return {
      ...demo,
      claims: demo.claims.filter((item) => item.key !== "taxi"),
    };
  });

  const [path, setPath] = useState("/m/expenses/claims"),
    [completed, setCompleted] = useState(false),
    [ask, setAsk] = useState(false);

  const approver = path === "/m/expenses/approvals";
  const pending = state.claims.filter((c) => c.stage === "pending");
  const approved = state.claims.filter((c) => c.stage === "approved");

  const visible = approver
    ? state.claims.filter((c) =>
        completed
          ? inApproverInbox(c) && c.stage !== "pending"
          : c.stage === "pending"
      )
    : state.claims;

  const selected = visible.find((c) => c.id === state.selected) ?? visible[0];
  useEffect(() => {
    if (!state.claims.some((c) => c.stage === "checking")) return;
    const timer = setTimeout(() => dispatch({ type: "checks" }), 1000);

    return () => clearTimeout(timer);
  }, [state.claims]);
  const preview = previewPages.get(path);

  return (
    <Navigate.Provider value={setPath}>
      <AppShell
        chrome="workspace"
        currentPath={path}
        navigation={navigation}
        identity={{
          companyName: "Genie",
          productName: "Ops Center",
          logoLightUrl: "/brand/logo-horizontal-color.svg",
          logoDarkUrl: "/brand/logo-horizontal-white.svg",
          markUrl: "/brand/icon-blue.svg",
        }}
        user={{
          name: "Demo workspace",
          roleLabel: "Expense claims demo",
        }}
        menu={{
          accountHref: "/account",
          changePasswordHref: null,
          switchTarget: null,
          supportHref: null,
          signOutAction: "#prototype",
        }}
        strings={strings}
        linkComponent={PrototypeLink}
      >
        <main className="space-y-5 pb-6">
          <details className="border-b border-border py-2 text-xs text-muted-foreground">
            <summary
              className={`w-fit cursor-pointer rounded-md py-2 ${focusRing}`}
            >
              Demo · both views enabled
            </summary>
            <p className="mb-3 max-w-prose leading-relaxed">
              My claims and Approvals are both shown so you can demo without
              changing accounts. Requesters cannot access Approvals in
              production. Receipts and AI checks are simulated; reload resets
              this demo.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  dispatch({ type: "demo" });
                  setPath("/m/expenses/approvals");
                  setCompleted(false);
                }}
              >
                Load demo queue
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  dispatch({ type: "reset" });
                  setPath("/m/expenses/claims");
                  setCompleted(false);
                }}
              >
                Reset demo
              </Button>
            </div>
          </details>
          {preview ? (
            <>
              <p className="text-xs text-muted-foreground">
                Existing {preview.title} component with its own sample data.
                Expense drafts stay here when you return.
              </p>
              <iframe
                title={`${preview.title} existing component preview`}
                src={`/iframe.html?id=${preview.story}&viewMode=story`}
                className="h-screen w-full border-0"
              />
            </>
          ) : path === "/ask" ? (
            <>
              <PageHeader
                title="Ask"
                description="Ask about the claims in this prototype."
              />
              <div className="mx-auto max-w-3xl space-y-5 py-8">
                <h2 className="text-xl font-semibold">
                  What would you like to know?
                </h2>
                <p className="text-sm text-muted-foreground">
                  This preset answer reads the current prototype state. No live
                  AI model is connected.
                </p>
                <Button variant="secondary" onClick={() => setAsk(true)}>
                  Which claims are waiting for approval?
                </Button>
                {ask && (
                  <section className="space-y-4 border-y border-border py-5">
                    <p>
                      {money(pending.reduce((sum, c) => sum + c.cents, 0))}{" "}
                      across {pending.length} claims awaiting a human decision.
                    </p>
                    {pending.map((c) => (
                      <div
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                      >
                        <span>
                          {c.merchant} · {money(c.cents)}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            dispatch({ type: "select", id: c.id });
                            setPath("/m/expenses/approvals");
                            setCompleted(false);
                          }}
                        >
                          Open {c.id}
                        </Button>
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">
                      Only pre-checked claims awaiting approval. Excludes
                      drafts, incomplete claims and final decisions.
                    </p>
                  </section>
                )}
              </div>
            </>
          ) : path === "/account" ? (
            <>
              <PageHeader title="Demo account" />
              <InfoNote>
                Both pages are exposed for this demo without switching accounts.
                In production, requesters cannot access Approvals. All records
                and AI checks here are simulated; reload resets the demo.
              </InfoNote>
            </>
          ) : !approver ? (
            <EmployeeClaims state={state} dispatch={dispatch} />
          ) : (
            <>
              <PageHeader
                title={approver ? "Approvals" : "My claims"}
                description={
                  approver
                    ? "Make the final decision on claims that have completed their pre-checks."
                    : "Submit expenses and track Morgan’s decision."
                }
              />
              <p role="status" className="text-sm text-muted-foreground">
                {state.message}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                <div className="flex gap-2">
                  <Button
                    variant={completed ? "ghost" : "secondary"}
                    onClick={() => setCompleted(false)}
                  >
                    Awaiting decision ({pending.length})
                  </Button>
                  <Button
                    variant={completed ? "secondary" : "ghost"}
                    onClick={() => setCompleted(true)}
                  >
                    Decided &amp; returned
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Approved:{" "}
                  {money(approved.reduce((sum, c) => sum + c.cents, 0))} · Paid:
                  SGD 0.00
                </p>
              </div>
              <div className="grid items-start gap-6 lg:grid-cols-4">
                <section
                  aria-label={approver ? "Approval queue" : "My claim list"}
                  className="min-w-0 space-y-2 lg:col-span-1"
                >
                  <h2 className="mb-3 text-sm font-semibold">
                    {approver
                      ? completed
                        ? "Decided & returned"
                        : "Claims to decide"
                      : "Your claims"}{" "}
                    ({visible.length})
                  </h2>
                  {visible.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={selected?.id === c.id}
                      onClick={() => dispatch({ type: "select", id: c.id })}
                      className={`w-full space-y-2 rounded-lg border p-3 text-left ${focusRing} ${selected?.id === c.id ? "border-input bg-muted" : "border-border bg-background hover:bg-muted"}`}
                    >
                      <span className="flex flex-wrap justify-between gap-2 text-sm font-semibold">
                        <span>{c.merchant}</span>
                        <span className="tabular-nums">{money(c.cents)}</span>
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {c.id} · {c.category}
                      </span>
                      <ClaimStatus claim={c} />
                      {c.checks.length > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          {c.checks.length} pre-check finding
                          {c.checks.length === 1 ? "" : "s"}
                        </span>
                      )}
                    </button>
                  ))}
                  {!visible.length && (
                    <p className="text-sm text-muted-foreground">
                      {completed
                        ? "No decisions yet."
                        : "Nothing awaiting approval. Submit a complete claim as Alex; it will arrive here after its pre-check."}
                    </p>
                  )}
                </section>
                <div className="min-w-0 lg:col-span-3">
                  {selected ? (
                    <ClaimEditor
                      key={`${selected.id}-${selected.stage}-${approver}`}
                      claim={selected}
                      approver={approver}
                      dispatch={dispatch}
                    />
                  ) : (
                    <div className="space-y-3 rounded-lg border border-border p-8">
                      <h2 className="text-lg font-semibold">
                        You’re up to date
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Drafts and incomplete claims stay with the employee. AI
                        cannot approve a claim.
                      </p>
                      <Button
                        variant="secondary"
                        onClick={() => setPath("/m/expenses/claims")}
                      >
                        Go to My claims
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <details className="border-t border-border pt-4 text-sm">
                <summary
                  className={`cursor-pointer font-semibold ${focusRing}`}
                >
                  Demo walkthrough &amp; policy
                </summary>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
                  <li>
                    Submit a claim in My claims. After AI checking, open
                    Approvals from the sidebar to record Morgan’s decision.
                  </li>
                  <li>
                    Attach the meal receipt. Submit, then approve the exception
                    with a required explanation, or return/reject with a reason.
                  </li>
                  <li>
                    Attach the receipt without a date. Submit: the pre-check
                    keeps it with Alex. Enter a date and resubmit.
                  </li>
                  <li>
                    Return a claim as Morgan. Alex sees the note, edits the
                    claim and resubmits through pre-checks.
                  </li>
                </ol>
                <p className="mt-3 text-muted-foreground">
                  SGD only. Meals: SGD 80 per receipt; transport: SGD 60. One
                  sample file creates one claim. AI and identity are simulated.
                  Approval does not make a payment.
                </p>
              </details>
            </>
          )}
        </main>
      </AppShell>
    </Navigate.Provider>
  );
}
