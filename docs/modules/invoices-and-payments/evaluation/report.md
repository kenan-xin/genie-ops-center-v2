# Model evaluation report

Run on 2026-11-01 against live models through the provider. 3 runs per case. Models: anthropic/claude-opus-5.5, openai/gpt-6.1-terra, deepseek/deepseek-v4.1-flash-1017. Reporting date 2026-10-27 (R-58).

## Extraction of the seven live uploads

| Model | Cases | Pass rate | Unstable cases | Mean cost | Mean time |
| --- | --- | --- | --- | --- | --- |
| anthropic/claude-opus-5.5 | 7 | 100.0 % | none | $0.0253 | 5.3 s |
| openai/gpt-6.1-terra | 7 | 100.0 % | none | $0.0020 | 5.0 s |
| deepseek/deepseek-v4.1-flash-1017 | 7 | 76.2 % | 01, 02, 03, 04, 05 | $0.0020 | 14.3 s |

## Answers to the nine read questions

| Model | Cases | Pass rate | Unstable cases | Mean cost | Mean time |
| --- | --- | --- | --- | --- | --- |
| anthropic/claude-opus-5.5 | 9 | 48.1 % | overdue-balances | $0.1744 | 19.4 s |
| openai/gpt-6.1-terra | 9 | 22.2 % | none | $0.0099 | 15.0 s |
| deepseek/deepseek-v4.1-flash-1017 | 9 | 7.4 % | invoices-without-due-date, manual-due-dates | $0.0019 | 10.8 s |

## Chart cases of the nine answers

| Model | Cases | Pass rate | Unstable cases |
| --- | --- | --- | --- |
| anthropic/claude-opus-5.5 | 14 | 66.7 % | overdue-balances: Overdue balance by customer, overdue-balances: Overdue total |
| openai/gpt-6.1-terra | 14 | 47.6 % | top-customers-by-sales: Invoiced sales by customer, top-customers-overdue: Overdue balance by customer |
| deepseek/deepseek-v4.1-flash-1017 | 14 | 9.5 % | top-customers-by-sales: Invoiced sales by customer, top-customers-overdue: Overdue balance by customer, invoices-without-due-date: Invoices with no due date, manual-due-dates: Due dates entered by a person |

Each chart case comes from its answer's model call, so its cost and time are in the answers table.

## Recommended defaults

- Chat model: anthropic/claude-opus-5.5 (the highest pass rate on answers and charts).
- Document model: openai/gpt-6.1-terra (the highest pass rate on extraction).

A tie goes to the lower mean cost, then the lower mean time.

## Failures

- anthropic/claude-opus-5.5, answers overdue-invoices, runs 1, 2, 3: The answer has no chart Overdue total.
- anthropic/claude-opus-5.5, charts overdue-invoices: Overdue total, runs 1, 2, 3: missing
- anthropic/claude-opus-5.5, answers repeated-late-payers, runs 1, 2, 3: wrong-answer
- anthropic/claude-opus-5.5, answers top-customers-by-sales, runs 1, 2, 3: The answer has no chart Invoiced sales by customer.
- anthropic/claude-opus-5.5, charts top-customers-by-sales: Invoiced sales by customer, runs 1, 2, 3: missing
- anthropic/claude-opus-5.5, answers top-customers-overdue, runs 1, 2, 3: The answer has no chart Overdue balance by customer.
- anthropic/claude-opus-5.5, charts top-customers-overdue: Overdue balance by customer, runs 1, 2, 3: missing
- anthropic/claude-opus-5.5, charts top-customers-overdue: Invoiced sales by customer, runs 1, 2, 3: missing
- anthropic/claude-opus-5.5, answers overdue-balances, runs 2: The answer has no chart Overdue total.
- anthropic/claude-opus-5.5, charts overdue-balances: Overdue total, runs 2: missing
- anthropic/claude-opus-5.5, answers overdue-balances, runs 3: The answer has no chart Overdue balance by customer.
- anthropic/claude-opus-5.5, charts overdue-balances: Overdue balance by customer, runs 3: missing
- openai/gpt-6.1-terra, answers overdue-invoices, runs 1, 2, 3: The answer has no chart Overdue total.
- openai/gpt-6.1-terra, charts overdue-invoices: Overdue total, runs 1, 2, 3: missing
- openai/gpt-6.1-terra, answers repeated-late-payers, runs 1, 2, 3: wrong-answer
- openai/gpt-6.1-terra, answers overdue-balances, runs 1, 2, 3: The answer has no chart Overdue total.
- openai/gpt-6.1-terra, charts overdue-balances: Overdue total, runs 1, 2, 3: missing
- openai/gpt-6.1-terra, answers monthly-invoiced-and-collected, runs 1, 2, 3: The answer has no chart Invoiced sales by month.
- openai/gpt-6.1-terra, charts monthly-invoiced-and-collected: Invoiced sales by month, runs 1, 2, 3: chart-invalid
- openai/gpt-6.1-terra, charts monthly-invoiced-and-collected: Collections by month, runs 1, 2, 3: chart-invalid
- openai/gpt-6.1-terra, answers top-customers-by-sales, runs 1, 3: The answer has no chart Invoiced sales by customer.
- openai/gpt-6.1-terra, charts top-customers-by-sales: Invoiced sales by customer, runs 1, 3: missing
- openai/gpt-6.1-terra, answers top-customers-overdue, runs 1, 3: The answer has no chart Overdue balance by customer.
- openai/gpt-6.1-terra, charts top-customers-overdue: Overdue balance by customer, runs 1, 3: missing
- openai/gpt-6.1-terra, charts top-customers-overdue: Invoiced sales by customer, runs 1, 2, 3: missing
- openai/gpt-6.1-terra, answers invoices-without-due-date, runs 1, 2, 3: The answer has no chart Invoices with no due date.
- openai/gpt-6.1-terra, charts invoices-without-due-date: Invoices with no due date, runs 1, 2, 3: missing
- openai/gpt-6.1-terra, answers top-customers-by-sales, runs 2: wrong-answer
- openai/gpt-6.1-terra, answers top-customers-overdue, runs 2: The answer has no chart Invoiced sales by customer.
- deepseek/deepseek-v4.1-flash-1017, extraction 01, runs 1: description
- deepseek/deepseek-v4.1-flash-1017, answers overdue-invoices, runs 1, 2, 3: Error: The answer does not parse: {"errors":[],"unresolved":[]}
- deepseek/deepseek-v4.1-flash-1017, charts overdue-invoices: Overdue invoices, runs 1, 2, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, charts overdue-invoices: Overdue total, runs 1, 2, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, answers repeated-late-payers, runs 1: AI_InvalidToolInputError: Invalid input for tool query-dataset: AI_TypeValidationError: Type validation failed: Value: {"dataset":"invoices.invoices","query":{"aggregates":[{"as":"settled","fn":"count","field":"id"},{"as":"late","fn":"count","field":"paidLate"}],"filters":[{"field":"customerId","op"... (cut, full text in results.json)
- deepseek/deepseek-v4.1-flash-1017, charts repeated-late-payers: Late payment by customer, runs 1, 2, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, answers overdue-balances, runs 1, 2, 3: not asked: question repeated-late-payers failed earlier in the session
- deepseek/deepseek-v4.1-flash-1017, charts overdue-balances: Overdue balance by customer, runs 1, 2, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, charts overdue-balances: Overdue total, runs 1, 2, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, answers monthly-invoiced-and-collected, runs 1: The answer has no chart Invoiced sales by month.
- deepseek/deepseek-v4.1-flash-1017, charts monthly-invoiced-and-collected: Invoiced sales by month, runs 1: chart-invalid
- deepseek/deepseek-v4.1-flash-1017, charts monthly-invoiced-and-collected: Collections by month, runs 1: chart-invalid
- deepseek/deepseek-v4.1-flash-1017, answers top-customers-by-sales, runs 1, 2: Error: The answer does not parse: {"errors":[],"unresolved":[]}
- deepseek/deepseek-v4.1-flash-1017, charts top-customers-by-sales: Invoiced sales by customer, runs 1, 2: no-answer
- deepseek/deepseek-v4.1-flash-1017, answers top-customers-overdue, runs 1, 2: not asked: question top-customers-by-sales failed earlier in the session
- deepseek/deepseek-v4.1-flash-1017, charts top-customers-overdue: Overdue balance by customer, runs 1, 2: no-answer
- deepseek/deepseek-v4.1-flash-1017, charts top-customers-overdue: Invoiced sales by customer, runs 1, 2: no-answer
- deepseek/deepseek-v4.1-flash-1017, answers invoices-without-due-date, runs 1, 3: Error: The answer does not parse: {"errors":[],"unresolved":[]}
- deepseek/deepseek-v4.1-flash-1017, charts invoices-without-due-date: Invoices with no due date, runs 1, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, answers manual-due-dates, runs 1, 3: not asked: question invoices-without-due-date failed earlier in the session
- deepseek/deepseek-v4.1-flash-1017, charts manual-due-dates: Due dates entered by a person, runs 1, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, answers partial-payments, runs 1, 2, 3: Error: The answer does not parse: {"errors":[],"unresolved":[]}
- deepseek/deepseek-v4.1-flash-1017, charts partial-payments: Invoices with partial payments, runs 1, 2, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, charts partial-payments: Allocations to those invoices, runs 1, 2, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, extraction 02, runs 2: date, reference, method
- deepseek/deepseek-v4.1-flash-1017, answers repeated-late-payers, runs 2, 3: Error: The answer does not parse: {"errors":[],"unresolved":[]}
- deepseek/deepseek-v4.1-flash-1017, answers monthly-invoiced-and-collected, runs 2, 3: Error: The answer does not parse: {"errors":[],"unresolved":[]}
- deepseek/deepseek-v4.1-flash-1017, charts monthly-invoiced-and-collected: Invoiced sales by month, runs 2, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, charts monthly-invoiced-and-collected: Collections by month, runs 2, 3: no-answer
- deepseek/deepseek-v4.1-flash-1017, extraction 03, runs 3: date
- deepseek/deepseek-v4.1-flash-1017, extraction 04, runs 3: date
- deepseek/deepseek-v4.1-flash-1017, extraction 05, runs 3: reference, method
- deepseek/deepseek-v4.1-flash-1017, answers top-customers-by-sales, runs 3: wrong-answer
- deepseek/deepseek-v4.1-flash-1017, answers top-customers-overdue, runs 3: The answer has no chart Invoiced sales by customer.
- deepseek/deepseek-v4.1-flash-1017, charts top-customers-overdue: Invoiced sales by customer, runs 3: missing
