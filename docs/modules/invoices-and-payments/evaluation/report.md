# Model evaluation report

Run on 2026-11-10 against live models through the provider. 3 runs per case. Models: anthropic/claude-opus-5.5, openai/gpt-6.1-terra, deepseek/deepseek-v4.1-flash-1017. Reporting date 2026-10-27 (R-58).

## Extraction of the seven live uploads

| Model | Cases | Pass rate | Unstable cases | Mean cost | Mean time |
| --- | --- | --- | --- | --- | --- |
| anthropic/claude-opus-5.5 | 7 | 100.0 % | none | $0.0255 | 5.6 s |
| openai/gpt-6.1-terra | 7 | 100.0 % | none | $0.0020 | 5.5 s |
| deepseek/deepseek-v4.1-flash-1017 | 7 | 52.4 % | 01, 02, 03, 04, 06 | $0.0014 | 19.8 s |

## Answers to the nine read questions

| Model | Cases | Pass rate | Unstable cases | Mean cost | Mean time |
| --- | --- | --- | --- | --- | --- |
| anthropic/claude-opus-5.5 | 9 | 59.3 % | repeated-late-payers, top-customers-overdue, partial-payments | $0.2945 | 13.7 s |
| openai/gpt-6.1-terra | 9 | 100.0 % | none | $0.0087 | 19.4 s |
| deepseek/deepseek-v4.1-flash-1017 | 9 | 18.5 % | monthly-invoiced-and-collected, top-customers-by-sales, top-customers-overdue, invoices-without-due-date, manual-due-dates | $0.0028 | 9.5 s |

## Chart cases of the nine answers

| Model | Cases | Pass rate | Unstable cases |
| --- | --- | --- | --- |
| anthropic/claude-opus-5.5 | 12 | 80.6 % | top-customers-overdue: Overdue balance by customer, partial-payments: Invoices with partial payments |
| openai/gpt-6.1-terra | 12 | 100.0 % | none |
| deepseek/deepseek-v4.1-flash-1017 | 12 | 19.4 % | monthly-invoiced-and-collected: Invoiced sales by month, monthly-invoiced-and-collected: Collections by month, top-customers-by-sales: Invoiced sales by customer, top-customers-overdue: Overdue balance by customer, top-customers-overdue: Invoiced sales by customer, invoices-without-due-date: Invoices with no due date, manual-due-dates: Due dates entered by a person |

Each chart case comes from its answer's model call, so its cost and time are in the answers table.

## Recommended defaults

- Chat model: openai/gpt-6.1-terra (the highest pass rate on answers and charts).
- Document model: openai/gpt-6.1-terra (the highest pass rate on extraction).

A tie goes to the lower mean cost, then the lower mean time.

## Failures

- anthropic/claude-opus-5.5, answers overdue-balances, runs 1, 2, 3: The answer has no chart Overdue balance by customer.
- anthropic/claude-opus-5.5, charts overdue-balances: Overdue balance by customer, runs 1, 2, 3: missing
- anthropic/claude-opus-5.5, answers monthly-invoiced-and-collected, runs 1, 3: The answer has 8 sentences; at most 5.
- anthropic/claude-opus-5.5, answers top-customers-overdue, runs 1, 3: The answer has no chart Overdue balance by customer.
- anthropic/claude-opus-5.5, charts top-customers-overdue: Overdue balance by customer, runs 1, 3: missing
- anthropic/claude-opus-5.5, answers partial-payments, runs 1, 2: The answer has no chart Invoices with partial payments.
- anthropic/claude-opus-5.5, charts partial-payments: Invoices with partial payments, runs 1, 2: missing
- anthropic/claude-opus-5.5, answers monthly-invoiced-and-collected, runs 2: The answer has 7 sentences; at most 5.
- anthropic/claude-opus-5.5, answers repeated-late-payers, runs 3: The answer has 6 sentences; at most 5.
- deepseek/deepseek-v4.1-flash-1017, extraction 01, runs 1: description
- deepseek/deepseek-v4.1-flash-1017, extraction 03, runs 1: date
- deepseek/deepseek-v4.1-flash-1017, extraction 04, runs 1: date
- deepseek/deepseek-v4.1-flash-1017, extraction 05, runs 1: reference, method
- deepseek/deepseek-v4.1-flash-1017, answers overdue-invoices, runs 1, 3: Error: The answer does not parse: {"errors":[],"unresolved":[]}
- deepseek/deepseek-v4.1-flash-1017, charts overdue-invoices: Overdue invoices, runs 1, 2, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, answers repeated-late-payers, runs 1: AI_StreamProviderError: Upstream error from OpenInference: Internal server error | Error: Something went wrong. The support team can look it up by the request id.
- deepseek/deepseek-v4.1-flash-1017, charts repeated-late-payers: Late payment by customer, runs 1, 2, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, answers overdue-balances, runs 1, 2, 3: not asked: question repeated-late-payers failed earlier in the session
- deepseek/deepseek-v4.1-flash-1017, charts overdue-balances: Overdue balance by customer, runs 1, 2, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, answers monthly-invoiced-and-collected, runs 1, 2: Error: The answer does not parse: {"errors":[],"unresolved":[]}
- deepseek/deepseek-v4.1-flash-1017, charts monthly-invoiced-and-collected: Invoiced sales by month, runs 1, 2: no-answer
- deepseek/deepseek-v4.1-flash-1017, charts monthly-invoiced-and-collected: Collections by month, runs 1, 2: no-answer
- deepseek/deepseek-v4.1-flash-1017, answers invoices-without-due-date, runs 1, 2: Error: The answer does not parse: {"errors":[{"code":"type-mismatch","component":"Answer","path":"/children/3","message":"field \"/children/3\" expects Heading | Paragraph | List | Chart but got array","statementId":"root"}],"unresolved":[]}
- deepseek/deepseek-v4.1-flash-1017, charts invoices-without-due-date: Invoices with no due date, runs 1, 2: no-answer
- deepseek/deepseek-v4.1-flash-1017, answers manual-due-dates, runs 1, 2: not asked: question invoices-without-due-date failed earlier in the session
- deepseek/deepseek-v4.1-flash-1017, charts manual-due-dates: Due dates entered by a person, runs 1, 2: no-answer
- deepseek/deepseek-v4.1-flash-1017, answers partial-payments, runs 1: Error: The answer does not parse: {"errors":[{"code":"type-mismatch","component":"Answer","path":"/children/2","message":"field \"/children/2\" expects Heading | Paragraph | List | Chart but got array","statementId":"root"}],"unresolved":[]}
- deepseek/deepseek-v4.1-flash-1017, charts partial-payments: Invoices with partial payments, runs 1, 2, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, charts partial-payments: Allocations to those invoices, runs 1, 2, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, extraction 03, runs 2: method
- deepseek/deepseek-v4.1-flash-1017, extraction 05, runs 2: date, reference, method
- deepseek/deepseek-v4.1-flash-1017, answers overdue-invoices, runs 2: Error: The answer does not parse: {"errors":[{"code":"type-mismatch","component":"Answer","path":"/children/3","message":"field \"/children/3\" expects Heading | Paragraph | List | Chart but got array","statementId":"root"}],"unresolved":[]}
- deepseek/deepseek-v4.1-flash-1017, answers repeated-late-payers, runs 2, 3: Error: The answer does not parse: {"errors":[],"unresolved":[]}
- deepseek/deepseek-v4.1-flash-1017, answers top-customers-by-sales, runs 2, 3: Error: The answer does not parse: {"errors":[],"unresolved":[]}
- deepseek/deepseek-v4.1-flash-1017, charts top-customers-by-sales: Invoiced sales by customer, runs 2, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, answers top-customers-overdue, runs 2, 3: not asked: question top-customers-by-sales failed earlier in the session
- deepseek/deepseek-v4.1-flash-1017, charts top-customers-overdue: Overdue balance by customer, runs 2, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, charts top-customers-overdue: Invoiced sales by customer, runs 2, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, answers partial-payments, runs 2: AI_StreamProviderError: Upstream error from OpenInference: Internal server error | Error: Something went wrong. The support team can look it up by the request id.
- deepseek/deepseek-v4.1-flash-1017, extraction 01, runs 3: number, date, currency, description, amount
- deepseek/deepseek-v4.1-flash-1017, extraction 02, runs 3: date
- deepseek/deepseek-v4.1-flash-1017, extraction 05, runs 3: date
- deepseek/deepseek-v4.1-flash-1017, extraction 06, runs 3: AI_NoObjectGeneratedError: No object generated: could not parse the response.
- deepseek/deepseek-v4.1-flash-1017, answers partial-payments, runs 3: Error: The answer does not parse: {"errors":[],"unresolved":[]}
