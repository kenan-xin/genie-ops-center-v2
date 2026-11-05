# Model evaluation report

Run on 2026-11-05 against live models through the provider. 3 runs per case. Models: anthropic/claude-opus-5.5, openai/gpt-6.1-terra, deepseek/deepseek-v4.1-flash-1017. Reporting date 2026-10-27 (R-58).

## Extraction of the seven live uploads

| Model | Cases | Pass rate | Unstable cases | Mean cost | Mean time |
| --- | --- | --- | --- | --- | --- |
| anthropic/claude-opus-5.5 | 7 | 100.0 % | none | $0.0255 | 5.5 s |
| openai/gpt-6.1-terra | 7 | 100.0 % | none | $0.0020 | 5.1 s |
| deepseek/deepseek-v4.1-flash-1017 | 7 | 66.7 % | 01, 02, 04 | $0.0015 | 16.5 s |

## Answers to the nine read questions

| Model | Cases | Pass rate | Unstable cases | Mean cost | Mean time |
| --- | --- | --- | --- | --- | --- |
| anthropic/claude-opus-5.5 | 9 | 81.5 % | overdue-invoices, top-customers-by-sales, top-customers-overdue, partial-payments | $0.3150 | 15.9 s |
| openai/gpt-6.1-terra | 9 | 100.0 % | none | $0.0103 | 16.9 s |
| deepseek/deepseek-v4.1-flash-1017 | 9 | 33.3 % | repeated-late-payers, overdue-balances, top-customers-by-sales, top-customers-overdue, invoices-without-due-date, manual-due-dates, partial-payments | $0.0040 | 13.9 s |

## Chart cases of the nine answers

| Model | Cases | Pass rate | Unstable cases |
| --- | --- | --- | --- |
| anthropic/claude-opus-5.5 | 12 | 83.3 % | overdue-invoices: Overdue invoices, top-customers-by-sales: Invoiced sales by customer, top-customers-overdue: Overdue balance by customer, top-customers-overdue: Invoiced sales by customer, partial-payments: Invoices with partial payments |
| openai/gpt-6.1-terra | 12 | 100.0 % | none |
| deepseek/deepseek-v4.1-flash-1017 | 12 | 33.3 % | repeated-late-payers: Late payment by customer, overdue-balances: Overdue balance by customer, top-customers-by-sales: Invoiced sales by customer, top-customers-overdue: Overdue balance by customer, top-customers-overdue: Invoiced sales by customer, invoices-without-due-date: Invoices with no due date, manual-due-dates: Due dates entered by a person, partial-payments: Invoices with partial payments, partial-payments: Allocations to those invoices |

Each chart case comes from its answer's model call, so its cost and time are in the answers table.

## Recommended defaults

- Chat model: openai/gpt-6.1-terra (the highest pass rate on answers and charts).
- Document model: openai/gpt-6.1-terra (the highest pass rate on extraction).

A tie goes to the lower mean cost, then the lower mean time.

## Failures

- anthropic/claude-opus-5.5, answers overdue-invoices, runs 1, 2: Error: The answer does not parse: {"errors":[{"code":"no-root","component":"Answer","path":"","message":"No root statement, and no statement calls the root component Answer"}],"unresolved":[]}
- anthropic/claude-opus-5.5, charts overdue-invoices: Overdue invoices, runs 1, 2: no-answer
- anthropic/claude-opus-5.5, answers top-customers-by-sales, runs 1: Error: The answer does not parse: {"errors":[{"code":"no-root","component":"Answer","path":"","message":"No root statement, and no statement calls the root component Answer"}],"unresolved":[]}
- anthropic/claude-opus-5.5, charts top-customers-by-sales: Invoiced sales by customer, runs 1: no-answer
- anthropic/claude-opus-5.5, answers top-customers-overdue, runs 1: not asked: question top-customers-by-sales failed earlier in the session
- anthropic/claude-opus-5.5, charts top-customers-overdue: Overdue balance by customer, runs 1: no-answer
- anthropic/claude-opus-5.5, charts top-customers-overdue: Invoiced sales by customer, runs 1: no-answer
- anthropic/claude-opus-5.5, answers partial-payments, runs 1: The answer has no chart Invoices with partial payments.
- anthropic/claude-opus-5.5, charts partial-payments: Invoices with partial payments, runs 1: missing
- deepseek/deepseek-v4.1-flash-1017, extraction 01, runs 1: dueDate
- deepseek/deepseek-v4.1-flash-1017, extraction 04, runs 1: reference
- deepseek/deepseek-v4.1-flash-1017, extraction 05, runs 1, 3: date, reference, method
- deepseek/deepseek-v4.1-flash-1017, answers overdue-invoices, runs 1, 2, 3: Error: The answer does not parse: {"errors":[],"unresolved":[]}
- deepseek/deepseek-v4.1-flash-1017, charts overdue-invoices: Overdue invoices, runs 1, 2, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, answers repeated-late-payers, runs 1: AI_StreamProviderError: Upstream error from OpenInference: Internal server error | Error: Something went wrong. The support team can look it up by the request id.
- deepseek/deepseek-v4.1-flash-1017, charts repeated-late-payers: Late payment by customer, runs 1: no-answer
- deepseek/deepseek-v4.1-flash-1017, answers overdue-balances, runs 1: not asked: question repeated-late-payers failed earlier in the session
- deepseek/deepseek-v4.1-flash-1017, charts overdue-balances: Overdue balance by customer, runs 1, 2: no-answer
- deepseek/deepseek-v4.1-flash-1017, answers monthly-invoiced-and-collected, runs 1, 3: Error: The answer does not parse: {"errors":[],"unresolved":[]}
- deepseek/deepseek-v4.1-flash-1017, charts monthly-invoiced-and-collected: Invoiced sales by month, runs 1, 2, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, charts monthly-invoiced-and-collected: Collections by month, runs 1, 2, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, answers top-customers-by-sales, runs 1, 3: Error: The answer does not parse: {"errors":[],"unresolved":[]}
- deepseek/deepseek-v4.1-flash-1017, charts top-customers-by-sales: Invoiced sales by customer, runs 1, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, answers top-customers-overdue, runs 1, 3: not asked: question top-customers-by-sales failed earlier in the session
- deepseek/deepseek-v4.1-flash-1017, charts top-customers-overdue: Overdue balance by customer, runs 1, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, charts top-customers-overdue: Invoiced sales by customer, runs 1, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, answers partial-payments, runs 1: AI_StreamProviderError: Upstream error from OpenInference: Internal server error | Error: Something went wrong. The support team can look it up by the request id.
- deepseek/deepseek-v4.1-flash-1017, charts partial-payments: Invoices with partial payments, runs 1, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, charts partial-payments: Allocations to those invoices, runs 1, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, extraction 01, runs 2: description
- deepseek/deepseek-v4.1-flash-1017, extraction 05, runs 2: reference, method
- deepseek/deepseek-v4.1-flash-1017, answers repeated-late-payers, runs 2: The answer does not open with a sentence.
- deepseek/deepseek-v4.1-flash-1017, answers overdue-balances, runs 2: AI_InvalidToolInputError: Invalid input for tool make-artifact: AI_TypeValidationError: Type validation failed: Value: {"config":{"series":[{"dataset":"invoices.invoices","name":"Overdue balance by customer","query":{"aggregates":[{"as":"overdueAmount","field":"outstandingCents","fn":"sum"},{"as":"i... (cut, full text in results.json)
- deepseek/deepseek-v4.1-flash-1017, answers monthly-invoiced-and-collected, runs 2: AI_InvalidToolInputError: Invalid input for tool make-artifact: AI_TypeValidationError: Type validation failed: Value: {"config":{"type":"bar","title":"Invoiced and collected each month, May to Oct 2026","series":[{"name":"Invoiced","dataset":"invoices.invoices","query":{"filters":[{"field":"invoice... (cut, full text in results.json)
- deepseek/deepseek-v4.1-flash-1017, extraction 02, runs 3: reference, method
- deepseek/deepseek-v4.1-flash-1017, answers invoices-without-due-date, runs 3: Error: The answer does not parse: {"errors":[],"unresolved":[]}
- deepseek/deepseek-v4.1-flash-1017, charts invoices-without-due-date: Invoices with no due date, runs 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, answers manual-due-dates, runs 3: not asked: question invoices-without-due-date failed earlier in the session
- deepseek/deepseek-v4.1-flash-1017, charts manual-due-dates: Due dates entered by a person, runs 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, answers partial-payments, runs 3: Error: The answer does not parse: {"errors":[],"unresolved":[]}
