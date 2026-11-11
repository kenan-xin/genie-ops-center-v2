// Throwaway workflow model. No live identities, document parsing or payments.
export const samples = {
  taxi: {
    id: "EX-001",
    file: "taxi-001.pdf",
    merchant: "City Cab",
    date: "2026-11-10",
    category: "Transport",
    cents: 2800,
    purpose: "Travel to the client workshop",
  },
  meal: {
    id: "EX-002",
    file: "meal-002.pdf",
    merchant: "Garden Kitchen",
    date: "2026-11-10",
    category: "Meals",
    cents: 12500,
    purpose: "Lunch with three client representatives",
  },
  missing: {
    id: "EX-003",
    file: "taxi-003.pdf",
    merchant: "City Cab",
    date: "",
    category: "Transport",
    cents: 1800,
    purpose: "Return to the office after the workshop",
  },
} as const;

export type SampleKey = keyof typeof samples;

export type Stage =
  | "draft"
  | "checking"
  | "needs-info"
  | "pending"
  | "returned"
  | "approved"
  | "rejected";

export type Claim = {
  id: string;
  file: string;
  merchant: string;
  date: string;
  category: "Meals" | "Transport";
  cents: number;
  purpose: string;
  key: SampleKey;
  stage: Stage;
  origin: string;
  checks: string[];
  decision: string;
  history: string[];
};

export type State = { claims: Claim[]; selected: string; message: string };

export type Action =
  | { type: "add"; key: SampleKey }
  | { type: "select"; id: string }
  | {
      type: "submit";
      id: string;
      date: string;
      purpose: string;
      actor: "employee" | "approver";
    }
  | { type: "checks" }
  | {
      type: "decision";
      id: string;
      decision: "approved" | "returned" | "rejected";
      note: string;
      actor: "employee" | "approver";
    }
  | { type: "reset" }
  | { type: "demo" };

export const money = (cents: number) => `SGD ${(cents / 100).toFixed(2)}`;

export const limit = (claim: Claim) =>
  claim.category === "Meals" ? 8000 : 6000;

export const editable = (claim: Claim) =>
  ["draft", "needs-info", "returned"].includes(claim.stage);

export const inApproverInbox = (claim: Claim) =>
  ["pending", "approved", "returned", "rejected"].includes(claim.stage);

export const stageLabel: Record<Stage, string> = {
  "draft": "Draft",
  "checking": "AI checking",
  "needs-info": "Needs your input",
  "pending": "Awaiting approval",
  "returned": "Returned for changes",
  "approved": "Approved",
  "rejected": "Rejected",
};

function draft(key: SampleKey): Claim {
  return {
    ...samples[key],
    key,
    stage: "draft",
    origin: samples[key].date ? "From sample receipt" : "Not found on receipt",
    checks: [],
    decision: "",
    history: ["Alex Tan attached a sample receipt."],
  };
}

export function initialState(): State {
  return {
    claims: [draft("taxi")],
    selected: "EX-001",
    message:
      "Complete your claim and submit it. AI checks run before it reaches Morgan, the approver.",
  };
}

export function claimReducer(state: State, action: Action): State {
  if (action.type === "reset") return initialState();

  if (action.type === "demo") {
    let next = initialState();
    next = claimReducer(next, { type: "add", key: "meal" });
    next = claimReducer(next, { type: "add", key: "missing" });

    for (const c of next.claims)
      next = claimReducer(next, {
        type: "submit",
        id: c.id,
        date: c.date,
        purpose: c.purpose,
        actor: "employee",
      });

    return {
      ...claimReducer(next, { type: "checks" }),
      selected: "EX-002",
      message:
        "Demo queue loaded: two claims await approval; one stays with Alex to complete its date.",
    };
  }

  if (action.type === "select") return { ...state, selected: action.id };

  const next: State = {
    ...state,
    claims: state.claims.map((c) => ({ ...c, history: [...c.history] })),
  };

  if (action.type === "add") {
    const found = next.claims.find((c) => c.key === action.key);

    if (found)
      return {
        ...state,
        selected: found.id,
        message: `Duplicate receipt: ${found.file} is already on ${found.id}. No second claim was added.`,
      };
    const c = draft(action.key);
    next.claims.push(c);
    next.selected = c.id;
    next.message =
      "Receipt attached to a new draft. Check the fields before submitting.";

    return next;
  }

  if (action.type === "checks") {
    for (const c of next.claims.filter((item) => item.stage === "checking")) {
      c.checks = [];

      if (!c.date)
        c.checks.push(
          "Receipt date is missing. Enter the date before this can reach an approver."
        );

      if (!c.purpose.trim())
        c.checks.push(
          "Business purpose is missing. Explain what the expense was for."
        );

      if (c.cents > limit(c))
        c.checks.push(
          `${money(c.cents - limit(c))} above the ${money(limit(c))} ${c.category.toLowerCase()} limit. Approver explanation required for an exception.`
        );
      c.stage = !c.date || !c.purpose.trim() ? "needs-info" : "pending";
      c.history.push(
        c.stage === "needs-info"
          ? "AI pre-check returned the claim to Alex for missing information."
          : "AI pre-check completed. Sent to Morgan for a human decision."
      );
    }

    next.message =
      "Pre-checks finished. Complete claims reached Approvals; incomplete claims remain in My claims.";

    return next;
  }

  const claim = next.claims.find((item) => item.id === action.id);

  if (!claim) return state;

  if (action.type === "submit") {
    if (action.actor !== "employee" || !editable(claim))
      return {
        ...state,
        message: "Only the employee can submit an editable claim.",
      };
    const d = action.date;

    if (
      d &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(d) ||
        !Number.isFinite(Date.parse(d)) ||
        new Date(d).toISOString().slice(0, 10) !== d)
    )
      return { ...state, message: "Enter a valid receipt date." };

    if (d !== claim.date) claim.origin = "Entered by Alex Tan";
    claim.date = d;
    claim.purpose = action.purpose.trim();
    claim.stage = "checking";
    claim.checks = [];
    claim.history.push("Alex Tan submitted the claim. AI pre-check started.");
    next.message =
      "Claim submitted. Checking receipt details, duplicates and policy limits before routing to the approver.";

    return next;
  }

  if (action.actor !== "approver" || claim.stage !== "pending")
    return {
      ...state,
      message:
        "Only the approver can decide a claim after its pre-checks are complete.",
    };
  const note = action.note.trim();

  if (!note && (action.decision !== "approved" || claim.cents > limit(claim)))
    return {
      ...state,
      message:
        "Add a decision note: required for an exception approval, return or rejection.",
    };
  claim.stage = action.decision;
  claim.decision = note;
  claim.history.push(
    `Morgan Lee: ${stageLabel[claim.stage]}.${note ? ` ${note}` : ""}`
  );
  next.message = `${claim.id}: ${stageLabel[claim.stage].toLowerCase()}. ${claim.stage === "approved" ? "Approved amount recorded; no money has been paid." : "Alex can see the decision and note in My claims."}`;

  return next;
}
