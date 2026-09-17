# Module: Contracts

Kind: customer module, first customer. Status: DEFERRED on customer discovery (`discovery.md`, D-1 to D-10). Starts after core roadmap Section 4 and after discovery closes.

## Who it is for

The customer's legal team, who register and own agreements, and the business users who need to find an agreement, read its key terms, and know when it expires without asking the legal team.

## Problem

Agreements are tracked in an Excel register with validity dates and status maintained by hand. Documents sit on an encrypted server the customer calls the "info cage". Business users cannot find or understand agreements without the legal team, and the legal team spends its time on extraction and tracking rather than review.

## Phases

### Phase one: register, versions, retrieval. No AI.

DEFERRED (D-1 to D-10). Provisional work items:

1. Agreement register: create, edit, archive. Fields from the Excel register. Counterparty as its own record.
2. Versions: upload to object storage or link, assign the next version number, keep every prior version.
3. Expiry and renewal: computed status, and one daily job declared through the module contract's Jobs point that evaluates `reminder_rule`, sends email through the core mailer, and records each send in `reminder_sent`.
4. Search and retrieval: filter by counterparty, type, office, status, date range. One click opens the current version.
5. Permissions and default roles as below. Office as a role-assignment scope if the customer confirms office-scoped visibility.
6. Import: a one-time loader from the existing Excel register.

Done when: the legal team loads the current register, a business user finds an agreement and opens its document, and an owner receives a reminder 90 days before expiry. Reminder lead time is provisional.

### Phase two: AI understanding

1. Extraction on upload: key obligations, important dates, payment terms, service commitments, termination conditions. Stored as a structured summary per version.
2. Clause search across agreements.
3. Ask-the-agreement chat, using the streaming route pattern that core provides (core roadmap Section 4, item 3) with the document as context.
4. Human review flag: a summary is marked reviewed by the legal team or not.

Done when: a business user opens an agreement and reads its summary and key dates without opening the document.

## Permissions and roles

Permission keys: `contracts:read`, `contracts:write`, `contracts:admin`. Default roles, provisional: `Contracts administrator` (all three), `Contracts editor` (`read`, `write`), `Contracts reader` (`read`).

## Tables `provisional`

DEFERRED (D-1 to D-10). Names and cardinality change after discovery (`OPEN-3`). The storage model, and therefore `agreement_version` and its use of `file` versus `external_url`, is `OPEN-2`.

`counterparty`: id, name, country, notes, created_at, updated_at.

`office`: id, code (unique), name, created_at, updated_at. A role-assignment scope when the customer confirms office-scoped visibility.

`agreement`: id, reference_code (unique), title, agreement_type, counterparty_id, office_id, owner_user_id, legal_contact_user_id, effective_date, expiry_date, validity_months, renewal_kind (`none`, `auto`, `manual`), termination_notice_days, status (`draft`, `active`, `expiring`, `expired`, `terminated`, `archived`), remarks, created_at, updated_at.

`agreement_version`: id, agreement_id, version_number (integer, unique per agreement), file_id (nullable, references core `file`), external_url (nullable), note, created_by_user_id, created_at. Insert-only. Exactly one of `file_id` or `external_url` is set.

`reminder_rule`: id, agreement_id (nullable for a default rule), days_before_expiry, recipient_kind (`owner`, `legal_contact`, `group`), recipient_group_id, active, created_at, updated_at.

`reminder_sent`: id, agreement_id, rule_id, sent_at, sent_to_user_id. Prevents duplicate sends.

Phase two adds `agreement_summary` (id, agreement_version_id, obligations jsonb, key_dates jsonb, payment_terms, service_commitments, termination_conditions, model, generated_at, reviewed_by_user_id, reviewed_at) and `agreement_clause` (id, agreement_version_id, heading, body, position, embedding as a vector when the database supports it, otherwise an external index key).

## Open decisions

| Id | Question | Default if not decided |
| --- | --- | --- |
| OPEN-2 | Store document files in object storage, or store metadata plus a link to the customer's existing encrypted file server? DEFERRED (D-1 to D-5). | Managed storage, because versioning and AI reading need the bytes. Link-only is a per-record option. |
| OPEN-3 | Register fields, roles, and reminder rules. DEFERRED (D-6 to D-10). | Fields taken from the Excel register shown in the brief. |
