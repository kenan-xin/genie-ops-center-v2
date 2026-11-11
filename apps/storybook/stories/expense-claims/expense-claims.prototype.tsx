import {
  AppShell,
  PageHeader,
  type ShellLinkComponent,
  type ShellNavigation,
  type ShellStrings,
} from "@genie/core/features/shell";
import {
  Button,
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
  workspace: [{ id: "core-ask", label: "Ask", href: "/ask" }],
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
    {
      id: "insights",
      name: "Insights",
      entries: [
        {
          id: "analytics",
          label: "Dashboards",
          href: "/m/analytics",
          icon: "layout-dashboard",
        },
        {
          id: "slides",
          label: "Slides",
          href: "/m/slides",
          icon: "presentation",
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
      className="space-y-4 rounded-lg bg-muted p-5"
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
      <p className="break-all text-xs text-muted-foreground">
        {claim.file} · Source stays unchanged when a person completes the claim.
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
      <ol
        aria-label="Claim progress"
        className="grid grid-cols-3 gap-3 border-y border-border py-3 text-xs text-muted-foreground"
      >
        <li>1. {claim.stage === "draft" ? "Draft" : "Submitted"}</li>
        <li>
          2.{" "}
          {claim.stage === "draft"
            ? "AI pre-check"
            : claim.stage === "checking"
              ? "Checking…"
              : "Pre-check complete"}
        </li>
        <li>
          3.{" "}
          {claim.stage === "approved"
            ? "Approved"
            : claim.stage === "rejected"
              ? "Rejected"
              : "Human decision"}
        </li>
      </ol>
      <div className="grid gap-6 xl:grid-cols-2">
        <Receipt claim={claim} />
        <div className="space-y-5">
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
              <h3 className="text-base font-semibold">Claim details</h3>
              <Field>
                <FieldLabel htmlFor="claim-date">Receipt date</FieldLabel>
                <Input
                  id="claim-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                <FieldDescription>
                  {claim.origin}. Missing dates will be returned by the
                  pre-check.
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
              </Field>
              <div className="flex items-center justify-between border-t border-border pt-4 text-sm">
                <span>Claim amount</span>
                <strong className="tabular-nums">{money(claim.cents)}</strong>
              </div>
              <Button type="submit">
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
                      No issues found. A human still needs to approve this
                      claim.
                    </InfoNote>
                  )}
                </>
              )}
            </section>
          )}
          {claim.decision && (
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

export function ExpenseClaimsPrototype() {
  const [state, dispatch] = useReducer(claimReducer, undefined, initialState);

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
          name: approver ? "Morgan Lee" : "Alex Tan",
          roleLabel: approver ? "Finance approver · demo" : "Employee · demo",
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
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              <LabelPill>Prototype</LabelPill>
              <span>
                Sample receipts · simulated AI and roles · resets on reload
              </span>
            </div>
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
          </div>
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
                This is a role simulation. Use My claims for Alex or Approvals
                for Morgan; no account settings or sign-out action are
                connected.
              </InfoNote>
            </>
          ) : (
            <>
              <PageHeader
                title={approver ? "Approvals" : "My claims"}
                description={
                  approver
                    ? "Make the final decision on claims that have completed their pre-checks."
                    : "Submit an expense, complete missing information and follow its approval."
                }
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm">
                  <strong>{approver ? "Morgan Lee" : "Alex Tan"}</strong>
                  <span className="text-muted-foreground">
                    {" "}
                    · {approver ? "Finance approver" : "Sales · employee"}
                  </span>
                </p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPath(
                      approver ? "/m/expenses/claims" : "/m/expenses/approvals"
                    );
                    setCompleted(false);
                  }}
                >
                  {approver ? "Switch to employee" : "Switch to approver"}
                </Button>
              </div>
              <p role="status" className="text-sm text-muted-foreground">
                {state.message}
              </p>
              {approver ? (
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
                    {money(approved.reduce((sum, c) => sum + c.cents, 0))} ·
                    Paid: SGD 0.00
                  </p>
                </div>
              ) : (
                <section
                  aria-label="Attach sample receipt"
                  className="flex flex-wrap items-center gap-2 border-b border-border pb-4"
                >
                  <span className="mr-2 text-sm font-semibold">New claim</span>
                  <Button
                    variant="secondary"
                    onClick={() => dispatch({ type: "add", key: "taxi" })}
                  >
                    Attach taxi receipt
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => dispatch({ type: "add", key: "meal" })}
                  >
                    Attach meal receipt
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => dispatch({ type: "add", key: "missing" })}
                  >
                    Attach receipt without date
                  </Button>
                </section>
              )}
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
                      className={`w-full space-y-2 rounded-lg border p-4 text-left ${focusRing} ${selected?.id === c.id ? "border-input bg-muted" : "border-border bg-background hover:bg-muted"}`}
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
                    As Alex, submit the taxi claim. Wait for AI checking, then
                    switch to Morgan and approve it.
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
