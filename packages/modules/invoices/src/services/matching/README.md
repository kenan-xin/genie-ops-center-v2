# src/services/matching

How a payment matches the open invoices of its customer.

## What belongs here

The pure matching rules of R-30 to R-33: given a payment's facts and the open invoices, the
answer is an automatic link, a link to confirm, an overpayment, a split proposal, suggestions or
no match. Inputs and outputs are plain values in integer cents.

## What must not go here

A database read, a write, a customer creation, a model call, a clock, and any import of
`@genie/core`. The save procedures in `services/ledger/` read the facts, call these rules and
write the result.
