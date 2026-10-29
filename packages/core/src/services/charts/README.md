# packages/core/src/services/charts

The chart gate: the one check a chart passes before a save or a show (Spec 7 R-14 to R-16).

## What belongs here

The panel config schema and its fix hints, in zod, types and pure helpers only, so a browser screen
can validate with it. The pure chart-type rules. The gate, which runs every series through the
dataset service under the caller's permissions and answers the chart data for the chart component
in `packages/ui`.

## What must not go here

SQL, a module table or a module import: the gate reads data only through the dataset service. A
save: a caller writes a panel only after the gate passed. Drawing code: the chart component lives
in `packages/ui`.
