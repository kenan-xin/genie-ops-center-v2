# Expense Claim Checker — throwaway workflow prototype

> Superseded by the component-based submission and approval demo below. The standalone HTML and its verification remain historical.

Question: can finance understand and resolve a claim exception without confusing review with approval or reimbursement?

Owner requested the prototype skill and a separate worktree. This uses the logic branch: one HTML file, pure state transitions, guided scenarios and free-play actions. The existing prototype styling informs the shell; this is not a production component or an application route.

Open `expense-checker.prototype.html` directly in a browser. No install or server is needed. Data resets on reload. The optional local preview serves this directory only.

Scope: three fictional receipts, SGD only, fixed per-receipt limits (meal 80, transport 60), exact sample-file deduplication, missing-date completion, review notes, reopening, locally calculated preset answers. No real PDF reading, AI, approval, reimbursement, persistence or integration. Duplicate detection compares sample file keys, not real hashes. Reviewed exceptions remain flagged; totals never imply money paid.

Tracking: [cvij.8] Prototype expense claim checking workflow. Branch: `codex/expense-checker-prototype`, based on `827ee730f6640037b51ede3f0e1e176b1a5b08bf`.

## Execution checklist

- [x] Read skill, existing module and prototype conventions; create isolated worktree and claim planning task.
- [x] Build self-contained workflow prototype with visible state and guided cases.
- [x] Check financial invariants and forbidden transitions with an ephemeral self-check.
- [x] Verify interactions and desktop/phone appearance in BrowserOS neo.
- [x] Run repository documentation validation.
- [x] Capture prototype and evidence on the throwaway branch; link in Beads.

## Decision

Awaiting owner feedback. No design or business-policy decision is approved by this prototype, and no production implementation is authorized. The prototype remains on its own branch; nothing is promoted to develop.

## Verification — 11 Nov 2026

- Ephemeral Node self-check passed: SGD 171 total / two unresolved exceptions; duplicate does not inflate totals; missing and invalid dates refused; blank exception note refused; reviewed meal retains SGD 45 excess; reopening restores attention; exact limit passes and one cent above flags; source receipt unchanged. No test suite added, as requested by the prototype skill.
- BrowserOS neo session `codex/expense-checker-prototype`: all four guided walkthroughs passed via native clicks. Expected and observed: one taxi remains SGD 28 after duplicate; incomplete claim cannot be reviewed; corrected date enables review; reviewed exception retains its flag.
- A markdown-read check initially could not see the textarea value; the accessibility snapshot confirmed it was retained. No application failure.
- Manual form checks passed on the phone viewport: date entry and review; exception note and review; date edit keeps the previous note. Keyboard arrows switch scenario tabs. Starting the first guided step resets prior free-play state.
- Preset spending answer: Transport SGD 46, Meals SGD 125; reload resets to zero claims.
- Desktop 1440px and phone 390px screenshots captured in the browser session; inspected layout for clipping and readable stacked controls. No console errors or warnings reported. This proves the standalone demo only, not production UI or backend behavior.
- `pnpm validate` passed. Only documentation/prototype files are changed; no production gate or Storybook suite is applicable to this standalone logic demo.
- Preview: `http://127.0.0.1:4318/expense-checker.prototype.html`. Reopen the HTML directly if the local preview is stopped.


## Current prototype: submission and approval

Owner refinements replace the standalone presentation with an actual AppShell and shared UI components. Claims now move from Alex (employee) through simulated pre-checks to Morgan (approver). The owner confirmed over-limit approval is allowed with a required explanation.

Start from this worktree with `pnpm nx run @genie/storybook:storybook --skip-nx-cache`. Open http://localhost:6006/?path=/story/prototypes-expense-claims--workflow or the distraction-free http://127.0.0.1:6006/iframe.html?id=prototypes-expense-claims--workflow&viewMode=story.

Source: `apps/storybook/stories/expense-claims/`. Existing AppShell, PageHeader, Button, Field, Input, Textarea, pills and notes are reused. Existing Documents, Invoices, Payments, Dashboards and Slides show their original Storybook component fixtures inside the shell; Ask provides a claim-state preset. These previews have separate sample data. There is no production route, backend, live identity, parsing, AI service or payment integration. Reload resets claims.

### Refinement checklist

- [x] Separate employee and approver views; keep original navigation.
- [x] Missing facts return to employee; complete claims reach approval after checks.
- [x] Approve, return, reject; require reasons for exceptions, returns and rejection.
- [x] Retain policy warnings and human decision history; approved is distinct from paid.
- [x] Verify pure transitions and native browser interactions, including phone.
- [x] Run Storybook MCP tests, repository gate, Impeccable detector and fresh finish review.
- [x] Capture on the same throwaway branch; no integration or push.

### Current verification

- Pure model self-check passed routing, actor guards, required exception notes, return/resubmit, missing/invalid dates, terminal states, duplicates and history retention.
- Native Neo `expense-approval-design`: clear approval, exception-note refusal and approval, return-note refusal, return/edit/resubmit, navigation preserves state, reload resets, phone missing-date correction reaches approver after checks, blank rejection refused. Invoices original component visually rendered. Other navigation targets selected; their full component workflows were not exercised.
- Desktop 1440x1000 and phone 390x844 inspected; phone decision controls wrap without clipping. Local screenshots in `.impeccable/review/`. Console clean before the deliberate Storybook file relocation; HMR was restarted after relocation and the story loaded successfully.
- Storybook MCP `test-run`: Workflow passed, including accessibility checks. `pnpm gate:fast`: all 9 targets passed. First run correctly rejected prototype inline copy under production source; moved demo to Storybook rather than weakening translation coverage.
- Impeccable detector: no findings. Fresh reviewer disposition `ship` at supplied desktop and phone screenshot scope; no material fixes. DESIGN.md unchanged, no new raster assets.
- User validation of the workflow remains open. This is demo evidence, not production authorization or backend/storage proof.

### Sidebar correction

Ask, Dashboards and Slides remain in Workspace. The illustrative Expenses module is assigned to one flat Expenses category; Approvals and My claims are direct page links, alphabetically ordered as the production navigation builder orders category entries. This is a fixed category fixture, not a new admin placement or subcategory mechanism.

Owner correction: Dashboards and Slides are uncategorized Workspace links. No Insights category.

### My claims refinement

Impeccable polish/adapt/clarify: sample choices use a New claim disclosure; employee form precedes the receipt on narrow screens; submission has a full-width phone target; date and purpose help explain the required action. Returned reason appears beside editable fields. Missing-information progress and completed-decision copy no longer imply a passed check or outstanding approval. Receipt filenames wrap at words.

Verified 1440px desktop, 834px tablet and 390px phone layouts in Chromium emulation; native browser missing date correction, return/edit/resubmit and approval passed. Storybook Workflow and gate:fast passed; no console errors/warnings. Detector returned no findings. Supplemental fresh-context designer review: ship for supplied desktop and phone captures. Physical devices and other browser engines untested.
