#!/bin/sh
# R-55: build and publish the default every-module image when no customer folder
# exists yet.
#
#   scripts/build-development-image.sh <version> [options]
#
# This image contains the placeholder module and is not a customer deliverable:
# the published ref is tagged `development`, so it can never be mistaken for one.
# The same gates, smoke and publish ordering as the customer script apply; see
# `scripts/build-customer-image.sh --help` for the shared options.
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

exec node "$repo_root/apps/genie/tools/release/cli.ts" --development-fallback "$@"
