# Module: Approvals

Kind: customer module, first customer, built to be reused by other customers. Status: DEFERRED on customer discovery (`discovery.md`, D-1 to D-12). Its shape is decided in [ADR 0012](../../adr/0012-approvals-module-split-and-relation-scopes.md), revision 4: one module with a workflow engine, a builder, and an agreement register that a workflow turns on. On 2026-10-20 the former contracts module was merged into this one, and its discovery questions moved here unchanged.

## Who it is for

People who request an approval, the approvers in the chain, the designers who define workflows, the legal team who register and own agreements, and the business users who need to find an agreement, read its key terms, and know when it expires without asking the legal team.

## Problem

Approvals run in a 2017 e-sign system the customer intends to shut down after moving. Agreements are tracked in an Excel register with validity dates and status maintained by hand. Documents sit on an encrypted server the customer calls the "info cage". Business users cannot find or understand agreements without the legal team, and the legal team spends its time on extraction and tracking rather than review.

## Accepted delay

When a requester moves to another department, the readers of the old department keep that requester's cases until the membership event is processed: normally within seconds, longer if the job worker is down or backed up. A change to a reader's own groups or roles applies on their next request. ADR 0012, section 3, records this.

## Provisional shape

Workflow definitions with versions, the five step kinds of ADR 0012, one form per workflow, cases with a full history, statuses, backups, leave, and delegation, and attachments that reference core `file`. A workflow may turn on the register feature: a case of that workflow creates a register entry with its number when it completes, in the same transaction.

Search, 2026-10-20 (owner): the module ships its own search page and list filters, filtered through `scopesFor()`. A Ctrl K search across modules is core work for later, when a second module needs it.

## Phases

### Register: register, versions, retrieval. No AI.

DEFERRED (D-1 to D-10). Provisional work items:

1. Agreement register: create, edit, archive. Fields from the Excel register. Counterparty as its own record.
2. Versions: upload to object storage or link, assign the next version number, keep every prior version.
3. Expiry and renewal: computed status, and one daily job declared through the module contract's Jobs point that evaluates `reminder_rule`, sends email through the core mailer, and records each send in `reminder_sent`.
4. Search and retrieval: filter by counterparty, type, office, status, date range. One click opens the current version.
5. Permissions and default roles as below. Office as a role-assignment scope if the customer confirms office-scoped visibility. Settled 2026-10-20 (owner, ADR 0012): the full register is read by `approvals:register-read` holders tenant-wide, so office stays a filter and a field, not a register visibility scope. Case visibility follows ADR 0012, section 3.
6. Import: a one-time loader from the existing Excel register.

Done when: the legal team loads the current register, a business user finds an agreement and opens its document, and an owner receives a reminder 90 days before expiry. Reminder lead time is provisional.

### Workflow: the engine, the builder, and the agreement review flow

DEFERRED (D-11 and D-12). The engine, the builder, and the register feature as ADR 0012 describes them. Done when: an applicant submits an agreement review, it passes its approval steps, and on completion its register entry and number appear on the applicant's own case.

### AI understanding

Model path, 2026-10-21 (owner): the register AI calls the genie-studio smart API over HTTP (`DEC-8`), through the core outbound HTTP service, with its key held as a `secret_ref`. It does not depend on the boss agent's model setting (`OPEN-12`).

1. Extraction on upload: key obligations, important dates, payment terms, service commitments, termination conditions. Stored as a structured summary per version.
2. Clause search across agreements.
3. Ask-the-agreement chat, using the streaming route pattern that core provides (core roadmap Section 4, item 3) with the document as context.
4. Human review flag: a summary is marked reviewed by the legal team or not.

Done when: a business user opens an agreement and reads its summary and key dates without opening the document.

The order of these phases is provisional. It follows the customer's phase plan as recorded on 2026-09-16, which the discovery answer map must confirm before work starts.

## Permissions and roles `provisional`

Proposed in ADR 0012, section 5: `approvals:use`, `approvals:case-read`, `approvals:register-read`, `approvals:register-manage`, `approvals:report`, `approvals:design`, `approvals:run-log`, `approvals:admin`. The former contracts keys `contracts:read`, `contracts:write`, and `contracts:admin` are replaced. Default roles follow ADR 0012, section 3, and stay unassigned at install.

## Tables `provisional`

DEFERRED (D-1 to D-12). Names and cardinality change after discovery (`OPEN-3`). The storage model, and therefore `agreement_version` and its use of `file` versus `external_url`, is `OPEN-2`. Workflow tables (definitions, versions, cases, steps, history, delegations) are designed when the workflow phase starts.

`counterparty`: id, name, country, notes, created_at, updated_at.

`office`: id, code (unique), name, created_at, updated_at. A filter on register entries. It was planned as a role-assignment scope, which the 2026-10-20 register audience decision replaces.

`agreement`: id, reference_code (unique), title, agreement_type, counterparty_id, office_id, owner_user_id, legal_contact_user_id, effective_date, expiry_date, validity_months, renewal_kind (`none`, `auto`, `manual`), termination_notice_days, status (`draft`, `active`, `expiring`, `expired`, `terminated`, `archived`), remarks, created_at, updated_at.

`agreement_version`: id, agreement_id, version_number (integer, unique per agreement), file_id (nullable, references core `file`), external_url (nullable), note, created_by_user_id, created_at. Insert-only. Exactly one of `file_id` or `external_url` is set.

`reminder_rule`: id, agreement_id (nullable for a default rule), days_before_expiry, recipient_kind (`owner`, `legal_contact`, `group`), recipient_group_id, active, created_at, updated_at.

`reminder_sent`: id, agreement_id, rule_id, sent_at, sent_to_user_id. Prevents duplicate sends.

The AI phase adds `agreement_summary` (id, agreement_version_id, obligations jsonb, key_dates jsonb, payment_terms, service_commitments, termination_conditions, model, generated_at, reviewed_by_user_id, reviewed_at) and `agreement_clause` (id, agreement_version_id, heading, body, position, embedding as a vector when the database supports it, otherwise an external index key).

## Open decisions

Ids were the contracts module's and are kept.

| Id | Question | Default if not decided |
| --- | --- | --- |
| OPEN-2 | Store document files in object storage, or store metadata plus a link to the customer's existing encrypted file server? DEFERRED (D-1 to D-5). | Managed storage, because versioning and AI reading need the bytes. Link-only is a per-record option. |
| OPEN-3 | Register fields, roles, and reminder rules. DEFERRED (D-6 to D-10). | Fields taken from the Excel register shown in the brief. |
