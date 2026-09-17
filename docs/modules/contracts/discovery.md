# Contracts: Customer Discovery

Status: awaiting the customer, 2026-09-16. Each question names the decision it unblocks. Ids are stable (`D-n`; D-11 and D-12 belong to the approvals module and live in `../approvals/discovery.md`). When a question is answered, record the answer under it, keep the id, and update the decision it unblocks in `README.md`.

Design and implementation paths that depend on an unanswered question are marked `DEFERRED (D-n)` in those documents and are not started until the answer is in.

## What the customer has confirmed

- Agreements are tracked today in an Excel register, with validity dates and status maintained by hand.
- Documents are kept on an encrypted server the customer calls the "info cage".
- Versions must not overwrite each other. A simple agreed format such as V1, V2, V3 is acceptable in principle.
- Phase one is document management and retrieval for business users. AI reading and the approval workflow come later.

## Document storage (unblocks OPEN-2)

D-1. What is the info cage technically: a Windows file share, SharePoint or another document system, or a locked-down server that only Legal's machines can reach? Can a server in the Genie Ops Center deployment reach it over the network, or is it closed to everything except Legal's desktops?

D-2. Who must be able to open a document from Genie: only people who already have access to the info cage, or also business users who do not? If business users have no info-cage access, a link-only design gives them nothing to open.

D-3. May Genie Ops Center hold a copy of each agreement in its own object storage, or must the info cage remain the single authoritative copy? If copies are allowed, is there a data-residency requirement for where that storage lives?

D-4. Is any class of agreement sensitive enough that its text must never be extracted, summarized, or indexed by an AI step, even inside the customer's own tenant? If yes, how is that class identified in the register?

D-5. How are versions managed today: file names, folders per year, or nothing formal? Would Legal accept Genie Ops Center assigning the version number on upload, so that nothing can overwrite an earlier version?

Deferred until D-1 to D-5 are answered: the choice between managed storage and link-only storage, the `agreement_version` and `file` design for contracts, the upload path in the contracts module, and the phase-two extraction pipeline.

## Register fields and roles (unblocks OPEN-3)

D-6. Which columns of the current Excel register are used in practice, which are obsolete, and which are missing? A copy of the register with sample rows, sensitive values removed, answers this fastest.

D-7. Which offices or entities own agreements, and must a person in one office be prevented from seeing another office's agreements? This decides whether office is a visibility scope or only a filter.

D-8. Who are the roles: who registers an agreement, who owns it, who is the legal contact, who may archive, and who only reads? Are business users allowed to upload a new version, or only Legal?

D-9. Reminders: how many days before expiry, to whom, how often, and by what channel? Is a renewal decision recorded in the register today?

D-10. Are there agreement types with different fields, for example NDA versus distributor versus service agreement, or does one field set cover all types?

Deferred until D-6 to D-10 are answered: the `agreement` field list, the `office` scope, the contracts default roles, the reminder rules, and the Excel import mapping.
