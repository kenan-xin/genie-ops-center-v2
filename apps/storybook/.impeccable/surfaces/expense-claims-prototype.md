---
version: 1
slug: "expense-claims-prototype"
primary_target: "stories/expense-claims/expense-claims.prototype.tsx"
related_targets: []
---

# Expense submission and approval prototype

Mode: Operate. Extend the existing Genie Ops Center shell using its real UI components. Employee submits; automatic pre-checks run before an approver sees a claim. Owner confirmed that over-limit claims may be approved with a required explanation. No production services or live claims. One local Storybook composition, in-memory data; earlier standalone HTML is historical.

## Direction contract

THESIS: Put the next human action beside its evidence, instead of making a flag look like an approval.

OWN-WORLD: Inherit DESIGN.md, AppShell, PageHeader, shared form fields, pills and warning notes. Existing Invoices, Payments, Documents, Ask, Dashboards and Slides remain in navigation.

STORY: Employee completes a receipt-backed draft; pre-checks return missing facts to the employee and forward complete claims with any exceptions. Approver reads source, employee purpose and checks, then approves, returns or rejects.

FIRST VIEWPORT: Existing rail left; compact demo actor switch above the page; employee claim list with submission form, approver queue with receipt alongside check findings and decision controls. No metric-card hero. Phone uses the real shell drawer and stacked evidence.

FORM: Local extension, code-led. seed: none (pinned). Owner: “a place to submit claims and a place to approve the claim”, “use existing components”, retain “bills and payments and ask etc tabs”. Signature interaction: a claim moves to the other actor only after pre-checks finish, while the warning follows it through final approval. Motion uses inherited controls only.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

DESIGN.md stays unchanged; no new visual world or raster assets. Prototype policy is illustrative, and role switching is not authentication.

Sidebar correction: Ask alone in Workspace; flat Expenses category contains Approvals and My claims as direct module page links. Category placement is a demo fixture, not a new admin capability.
