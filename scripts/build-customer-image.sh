#!/bin/sh
# Build one customer's production image from its modules.txt, smoke-check that
# exact candidate, then publish it (R-34, R-51, AC-8).
#
#   scripts/build-customer-image.sh <slug> <version> [options]
#
# MODULE_INCLUDE is the only build argument. The script reads
# customers/<slug>/deploy/modules.txt, builds the one Dockerfile with that
# explicit list, resolves the built image's immutable digest, smoke-checks that
# digest, and only then publishes it. Publishing is non-cacheable and runs only
# through the authorized boundary; pass --no-publish for a local dry run and
# --publish-command "<argv>" to drive a safe local sink instead of a real push.
#
# Run `scripts/build-customer-image.sh --help` for the full option list.
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

exec node "$repo_root/apps/genie/tools/release/cli.ts" "$@"
