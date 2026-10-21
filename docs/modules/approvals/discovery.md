# Approvals: Customer Discovery

Status: awaiting the customer, 2026-09-16. Ids are stable (`D-n`). D-1 to D-10 were the contracts module's questions; they moved here unchanged on 2026-10-20, when ADR 0012 (revision 4) merged contracts into this module as the register feature. When a question is answered, record the answer under it, keep the id, and update the decision it unblocks in `README.md`.

Design and implementation paths that depend on an unanswered question are marked `DEFERRED (D-n)` in those documents and are not started until the answer is in.

Answer map, 2026-10-21. The product documents of the first customer's agreement product already answer many questions. Each such answer is recorded under its question and starts with "Answer from the product docs, 2026-10-21, not confirmed by the customer:". Each answer says whether its source is a customer statement or a decision of the product team, and what it unblocks, as ADR 0012 requires. An answer from the product docs lets provisional design go ahead. The customer still confirms it. A question that the product docs contradict, or answer only in part, stays open for the missing part.

Sources are paths in the customer docs folder of the product repository. `sections/` means `2-requirements/_site-source/content/sections/`. `PD-n` and `TD-n` are product and technical decisions in `5-decision-log/product-decisions.md` and `5-decision-log/technical-decisions.md`.

## What the customer has confirmed

Recorded 2026-09-16, before the merge into this module. The last item describes the phase plan as stated then, and the discovery answer map of ADR 0012 must confirm it again.

- Agreements are tracked today in an Excel register, with validity dates and status maintained by hand.
- Documents are kept on an encrypted server the customer calls the "info cage".
- Versions must not overwrite each other. A simple agreed format such as V1, V2, V3 is acceptable in principle.
- Phase one is document management and retrieval for business users. AI reading and the approval workflow come later.

Note, 2026-10-21: the product docs replace the last item. Their phase one holds the approval workflow, the register, and AI reading at upload, and it replaces the e-sign system for agreements (`sections/phasing.md` line 8, PD-067). The chatbot and the data migration move to phase two, and each phase-two item waits for the customer (PD-093). This is a decision of the product team, not a customer statement.

## Document storage (unblocks OPEN-2)

D-1. What is the info cage technically: a Windows file share, SharePoint or another document system, or a locked-down server that only Legal's machines can reach? Can a server in the Genie Ops Center deployment reach it over the network, or is it closed to everything except Legal's desktops?

Answer from the product docs, 2026-10-21, not confirmed by the customer: answered in part. The info cage is an encrypted server that nobody can read, the AI included. The customer said that it stays in use, and also that it can be phased out. The product does not connect to it: every document is uploaded into the product's own storage (D-3). The docs do not say what the server is technically or whether a server can reach it, so that part stays open. It no longer blocks the register, because the register keeps its own copies. Source: `sections/register.md` line 74 (customer statements in the meeting of 2026-09-25), PD-094, TD-023.

D-2. Who must be able to open a document from Genie: only people who already have access to the info cage, or also business users who do not? If business users have no info-cage access, a link-only design gives them nothing to open.

Answer from the product docs, 2026-10-21, not confirmed by the customer: business users open documents in the product, from the copy that the product holds, so info-cage access does not matter. An applicant sees the documents of their own cases, and a role setting can widen this. A department head sees all cases of the department. The legal team sees all cases. The company general manager reads the full register and opens any case from it. The system administrator sees no case documents. Source: PD-011, PD-095, PD-110, `sections/roles.md` lines 11 to 17. Decisions of the product team. Unblocks: managed storage over link-only storage.

D-3. May Genie Ops Center hold a copy of each agreement in its own object storage, or must the info cage remain the single authoritative copy? If copies are allowed, is there a data-residency requirement for where that storage lives?

Answer from the product docs, 2026-10-21, not confirmed by the customer: answered in part. The product holds every uploaded agreement and every version of it in S3, in a cloud environment dedicated to the customer, and keeps them forever. The product team decided this on 2026-10-19. In a meeting the customer suggested an S3 folder, and added "This one we can discuss". The docs state no data-residency requirement and no region, so that part stays open. Source: PD-094, PD-108, TD-023, `sections/register.md` lines 65 and 74. Unblocks: managed storage as the provisional choice for `OPEN-2`.

D-4. Is any class of agreement sensitive enough that its text must never be extracted, summarized, or indexed by an AI step, even inside the customer's own tenant? If yes, how is that class identified in the register?

Answer from the product docs, 2026-10-21, not confirmed by the customer: the docs contradict each other, so the question stays open. PD-094 says that the AI reads and extracts every legal document that applicants upload, with no excluded class. The product team decided this on 2026-10-19, and the entry says that it is not a customer statement. The customer said that the legal documents applicants submit are "S rank" under the parent company's rank list, and that S-rank documents sit in a store that nobody can read. The customer then suggested an S3 folder that the AI can read, and added "This one we can discuss". No customer statement releases S-rank documents to the AI, and the docs name no class that the AI must not read. Source: PD-094 (its evidence cites the meeting of 2026-09-25), `sections/register.md` line 74, TD-023.

D-5. How are versions managed today: file names, folders per year, or nothing formal? Would Legal accept Genie Ops Center assigning the version number on upload, so that nothing can overwrite an earlier version?

Answer from the product docs, 2026-10-21, not confirmed by the customer: today each case has one folder on the server. The folder holds the concluded agreement, the correspondence, the e-sign approval export, and draft versions in Word. In the product every upload is a new version and never overwrites an earlier one. The file name carries the version as `V<n>`, and the version is also kept as data. Source: `sections/register.md` line 65 and the `20 Filing` row that follows it (from the customer's workbook), PD-057 (`product-decisions.md` line 1225), PD-100. The folder layout is a customer fact. The version rule is a decision of the product team. Unblocks: the version number assigned on upload.

Deferred until D-1 to D-5 are answered: the choice between managed storage and link-only storage, the `agreement_version` and `file` design for the register (written "for contracts" before the merge), the register upload path in approvals, and the phase-two extraction pipeline.

Update 2026-10-21: the product docs answer D-2 and D-5, and D-1 and D-3 in part. Managed storage, the `agreement_version` design, and the upload path go ahead as provisional design. The extraction pipeline stays deferred on D-4, and the storage region stays open on D-3.

## Register fields and roles (unblocks OPEN-3)

D-6. Which columns of the current Excel register are used in practice, which are obsolete, and which are missing? A copy of the register with sample rows, sensitive values removed, answers this fastest.

Answer from the product docs, 2026-10-21, not confirmed by the customer: the register is the customer's new master list format, with 17 columns plus a status. The customer sent this format. All columns except Remarks are mandatory, and each one is filled at the step that produces it. The columns of the old control list and the monthly record that have no master-list column stay as optional fields. The customer said that the format is not final, and the product docs still ask the customer for it. Source: `sections/register.md` line 7, the column table from line 22, the migration table from line 49, PD-053, PD-105. Unblocks: the provisional `agreement` field list and the import mapping.

Note on D-7, 2026-10-20: the owner settled the register audience (ADR 0012): `approvals:register-read` holders read the full register tenant-wide. The question stays, with its original wording, to learn whether office is needed as a filter or field.

D-7. Which offices or entities own agreements, and must a person in one office be prevented from seeing another office's agreements? This decides whether office is a visibility scope or only a filter.

Answer from the product docs, 2026-10-21, not confirmed by the customer: only the staff of one entity of the customer group use the system. The other group companies have no access, and their codes are only values of the office field. The register keeps the section (the department) and the group office as two separate fields. Office is therefore a field and a filter, not a visibility scope. Visibility follows the department: a department head sees all cases of the department. Source: PD-008, PD-080, PD-011, `sections/register.md` line 26. Decisions of the product team, from the customer's old control list columns. Unblocks: the `office` field and filter.

D-8. Who are the roles: who registers an agreement, who owns it, who is the legal contact, who may archive, and who only reads? Are business users allowed to upload a new version, or only Legal?

Answer from the product docs, 2026-10-21, not confirmed by the customer: the applicant registers an agreement by uploading it, which creates the case and its register row. The legal team is two people, the legal executive and the legal manager. The legal team confirms the register fields, and the legal manager owns the register and its exports. The company general manager reads the register and cannot edit it. A section read-only role for the rows of one section is still an internal open point of the product team. Business users upload new versions: on a returned case, and after approval under the same application. Nothing is archived or deleted: the rows of withdrawn cases stay, and documents are kept forever. Source: `sections/roles.md` lines 11, 14, 15 and 17, `sections/register.md` line 7, PD-009, PD-099, PD-100, PD-108, PD-110. The two-person legal team is a customer fact. The rest are decisions of the product team. Unblocks: the register default roles.

D-9. Reminders: how many days before expiry, to whom, how often, and by what channel? Is a renewal decision recorded in the register today?

Answer from the product docs, 2026-10-21, not confirmed by the customer: phase one sends no reminders and no email. All notifications are in-app. For a later phase the product team proposes a renewal or notice reminder 7 days before the date, to the person in charge and the legal team, by email and in-app. Email waits for the customer to accept an external sender address. The register records the renewal type, the renewal month, and the notice period as termination fields, which the AI reads from the agreement. Source: PD-050, PD-034, PD-104, `sections/register.md` (the Termination info row and the migration table from line 49). Decisions of the product team. Unblocks: no reminder job in phase one.

D-10. Are there agreement types with different fields, for example NDA versus distributor versus service agreement, or does one field set cover all types?

Answer from the product docs, 2026-10-21, not confirmed by the customer: one field set covers all types. Type of agreement is one field with eight values. The AI proposes the type, and the applicant accepts it. The AI brief uses one general rulebook for all types. Whether "Agreement" is a type of its own is still a question to the customer. Source: `sections/register.md` line 30, `sections/features.md` line 41, `sections/wt-ai.md` line 13, PD-105. Unblocks: one `agreement` field set.

Deferred until D-6 to D-10 are answered: the `agreement` field list, the `office` field and filter, the register default roles (written "contracts" before the merge), the reminder rules, and the Excel import mapping.

Update 2026-10-21: the product docs answer D-6 to D-10. The field list, the office field and filter, the default roles, and the import mapping go ahead as provisional design. Phase one has no reminder rules.

## The approval workflow

D-11. What does the current e-sign approval hierarchy look like: fixed chains per document type, or chosen per request? How many steps, and who may approve on someone's behalf?

Answer from the product docs, 2026-10-21, not confirmed by the customer: one fixed chain for every request. The steps are the department head check, the legal check by the legal executive or the legal manager, the legal manager verification, and the company general manager approval, then signing. Each step names one fixed person in charge, plus ordered backups who act always or only while that person is away. Each person also sets personal backups, and any user can name a delegate for a period of leave. The customer uses one copy of the workflow per department, each with that department's head. The product team proposes three departments, Sales, Purchasing and Logistics. Which departments exist, and who heads each, is still a question to the customer. Source: PD-009, PD-098, PD-112, PD-092, `sections/roles.md` lines 21 and 26, `sections/platform.md` line 24. The e-sign chain is a customer fact. The fixed person per step and the copy per department are decisions of the product team. Unblocks: the seed workflow and its workflow groups.

D-12. What must be kept when e-sign is shut down: history of past approvals, templates, signatures as evidence, or nothing?

Answer from the product docs, 2026-10-21, not confirmed by the customer: answered in part. Cases that are open in e-sign at go-live finish there. The history moves later, in phase two: about 700 cases with about 7 documents each, with a notice of the date from which the data is complete. Migrated rows keep the e-sign request id as plain text. Each case folder today already holds the e-sign approval as a Word export. The docs do not say whether signatures must be kept as evidence, or whether e-sign templates move, so that part stays open. Source: PD-006 (a customer statement in a meeting), PD-007, PD-093, `sections/phasing.md` line 28, `sections/register.md` (the `20 Filing` row). Unblocks: the import of e-sign history as phase-two work.

D-13. Added 2026-10-20 from the first-customer fit review. The product documents say only that "identities come from Active Directory". Do people sign in through Microsoft Entra ID or ADFS, or is there only an on-premises Active Directory with no cloud or federation service? Entra ID and ADFS work today through the brokered realm. On-premises Active Directory alone needs LDAP federation, which is deferred (Specification 02, "Deferred").

Product docs, 2026-10-21: no new answer, so the question stays open. The docs say "Identities come from Active Directory", that the administrator runs an AD sync, and that sign-in is only through the company SSO. They do not name Entra ID, ADFS, or another federation service. Source: PD-009, `sections/platform.md` line 10, `sections/features.md` line 49.

Deferred until D-13 is answered: the identity-provider setup for this customer, and whether LDAP federation must be reopened.

Deferred until D-11 and D-12 are answered: the workflow engine, its approval steps, and the import of e-sign history.

Update 2026-10-21: the product docs answer D-11, and D-12 in part. The engine and the approval steps go ahead as provisional design. The import of e-sign history is phase-two work, and what it keeps beyond the case history stays open on D-12. Before 2026-10-20 this line deferred the whole approvals module, which then held only the workflow.
