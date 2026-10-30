import type { RequiredCase } from "@genie/core/testing/required-tests-validator";

/**
 * The placeholder module's integration manifest.
 *
 * The manifest is fixed in code and has no invocation flag: a run either proves
 * these cases or fails. The validator and its case shape are core's, shared
 * through `@genie/core/testing/required-tests-validator`, so the module keeps
 * only the manifest that is its own. Each entry is derived from a named
 * acceptance clause:
 *
 * - R-24 and R-38: the router and schema proof runs against a real Postgres
 *   with the real histories applied, and no part of the database is mocked.
 * - DEC-34: the standing tenant-isolation test reads through this router, so
 *   its read path cannot silently stop running.
 */
export * from "@genie/core/testing/required-tests-validator";

export const REQUIRED_TESTS: readonly RequiredCase[] = [
  {
    file: "testing/router.integration.test.ts",
    reason:
      "R-24 and R-38 require the placeholder router and schema proof to run against a real database, and DEC-34's isolation proof reads through this router; Spec 7 R-1 and AC-1: the record page loads through the module's own procedure under the route's permission",
    cases: [
      "the placeholder read procedure against a real database answers the rows this deployment holds",
      "the placeholder read procedure against a real database refuses a caller without the key, and reads nothing",
      "the placeholder read procedure against a real database refuses the read with module-disabled when the placeholder entitlement is off",
      "the placeholder read procedure against a real database answers only the named record to a person with a record-scoped read grant",
      "the placeholder read procedure against a real database refuses an anonymous caller",
      "the placeholder read procedure against a real database answers a dataset source whose aliased subquery reads the seeded rows",
      "the placeholder read procedure against a real database appends placeholder:admin to Tenant administrator on enable and removes it on disable",
      "the placeholder read procedure against a real database get answers one record to a holder of placeholder:use on it, and refuses or misses otherwise",
    ],
  },
  {
    file: "testing/datasets.integration.test.ts",
    reason: "Spec 7 AC-2 and AC-3: the dataset seam on the placeholder",
    cases: [
      "the placeholder dataset through queryDataset lists the placeholder dataset only to a person who holds placeholder:read",
      "the placeholder dataset through queryDataset sums amounts per currency",
      "the placeholder dataset through queryDataset counts quantities in labelled ranges in range order, leaving out nulls and values outside every range",
      "the placeholder dataset through queryDataset groups a date by week from Monday and answers ISO dates",
      "the placeholder dataset through queryDataset filters by record id against the uuid column",
      "the placeholder dataset through queryDataset refuses a person without placeholder:read, and answers a record-scoped reader only that record",
      "the placeholder dataset through queryDataset refuses an unknown field with dataset-query-invalid naming select.0",
      "the placeholder dataset through queryDataset returns at most 1,000 rows and says it was truncated",
      "the placeholder dataset through queryDataset stops a query after 5 seconds",
      "the placeholder dataset through queryDataset totals money per currency: none, one, two",
      "the placeholder dataset through queryDataset skips the dataset of a disabled module",
      "the placeholder dataset through queryDataset the reporting date moves the result",
      "the placeholder dataset through recordRoute routes a dataset row to its record page only for a person allowed to open it",
      "the placeholder dataset through recordRoute routes only the record a record-scoped use grant names",
      "the placeholder dataset through queryDatasetSeries joins two series on the month and leaves a missing month empty",
      "the placeholder dataset through queryDatasetSeries refuses the whole series query when the caller cannot read a series' dataset",
      "the placeholder dataset through queryDatasetSeries refuses more than 10 series",
      "the placeholder dataset through queryDatasetSeries keeps the first 1,000 joined rows in x order and says it was truncated",
      "the placeholder dataset through queryDatasetSeries stops the whole series query after 5 seconds, though each read waits less",
      "the placeholder dataset through queryDatasetSeries refuses a series query whose aggregate is not a known function",
    ],
  },
  {
    file: "testing/chart-gate.integration.test.ts",
    reason:
      "Spec 7 AC-4: the chart gate's query and column checks on the placeholder",
    cases: [
      "the chart gate on placeholder.records passes a bar chart of one series and answers its rows, dataset and read time",
      "the chart gate on placeholder.records joins two series on the month and leaves a missing month empty, never 0",
      "the chart gate on placeholder.records points a query the dataset refuses at its own series",
      "the chart gate on placeholder.records refuses a dataset the caller cannot read like one that does not exist",
      "the chart gate on placeholder.records refuses money that one axis cannot show in one currency",
      "the chart gate on placeholder.records passes an empty result: a money KPI over no rows answers one empty value",
      "the chart gate on placeholder.records shows each table amount in the currency of its row",
    ],
  },
  {
    file: "testing/events.integration.test.ts",
    reason:
      "R-53 to R-58 require the placeholder's fast, durable, and serialized subscriptions to run end to end against a real database",
    cases: [
      "the placeholder event subscriptions against Testcontainers Postgres runs its fast, durable, and serialized effects end to end",
    ],
  },
  {
    file: "testing/jobs.integration.test.ts",
    reason:
      "Spec 7 R-12 and AC-3: a module-enqueued job runs as its starter and retries by its declared policy",
    cases: [
      "the placeholder touch job through the worker a touch by a reader runs as them and audits under their name",
      "the placeholder touch job through the worker a touch by a person without placeholder:read completes and writes nothing",
      "the placeholder touch job through the worker a forged starter in the job data is replaced by the caller",
      "the placeholder touch job through the worker a forged starter through the raw queue runs with no caller and writes nothing",
      "the placeholder touch job through the worker a failed run is retried by the declared policy, then completes",
    ],
  },
  {
    file: "testing/agent-tools.integration.test.ts",
    reason:
      "Spec 7 R-43, R-47 and AC-8 lines 2 and 3: the agent tools read as the asker, and each call writes one audit row without the returned values",
    cases: [
      "the agent tools on the placeholder answers only the rows inside the asker's scope, from a core and a module tool",
      "the agent tools on the placeholder refuses a person without placeholder:read on every tool",
      "the agent tools on the placeholder offers the placeholder's tool and dataset only while the module is on",
      "the agent tools on the placeholder writes one audit row per call with the query and row count, and no returned value",
      "the agent tools on the placeholder writes a refused call's row with outcome forbidden and row count 0",
      "the agent tools on the placeholder answers an unknown field with the dataset's fix hint and records dataset-query-invalid",
    ],
  },
  {
    file: "testing/agent-access.integration.test.ts",
    reason:
      "Spec 7 R-42: Ask links to an enabled module's document inbox only for a person who may open it",
    cases: [
      "agentAccess on the placeholder links the placeholder's inbox only for a holder of placeholder:use while the module is on",
    ],
  },
  {
    file: "testing/agent-route.integration.test.ts",
    reason:
      "Spec 7 R-40, R-41 and R-18: the agent route streams UI message parts from the recorded model, stores the exchange, and keeps a session's model; AC-8 lines 1 and 2, R-43 and R-47: the route runs the tools as the asker, stores their results and audits each call",
    cases: [
      "the agent route on the placeholder streams the recorded answer as UI message chunks and stores the exchange under the question",
      "the agent route on the placeholder sends a later message without a model id to the model the session started with",
      "the agent route on the placeholder answers a reader's count through list-datasets and query-dataset, stores both results, and audits both calls as the reader",
      "the agent route on the placeholder refuses a module tool inside the stream for a person without placeholder:read, answers the refusal, and audits it as forbidden",
    ],
  },
];
