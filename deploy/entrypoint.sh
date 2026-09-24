#!/bin/sh
# One image runs the application, the worker and the operator command through
# flags (R-35). Section 0 ships the dispatch and the application path; Section 1
# adds the genie-ops command, which `docker exec` also reaches directly on PATH
# without this script (D-10).
set -eu

# The standalone entry point's depth depends on where the framework decides the
# file tracing root is, which differs between a standalone project and a
# workspace member. Locate it rather than hard-coding a path that reviews have
# already disagreed about. Failing loudly beats starting nothing.
find_server() {
  found=$(find /app -maxdepth 4 -name server.js -not -path '*/node_modules/*')
  count=$(echo "$found" | grep -c . || true)

  # Exactly one, not the first of several. An ambiguous tree would otherwise
  # start an arbitrary root whose assets sit somewhere else.
  if [ "$count" -ne 1 ]; then
    echo "Expected exactly one standalone server.js under /app, found $count." >&2
    echo "$found" >&2
    exit 70
  fi

  echo "$found"
}

case "${1:-app}" in
  app)
    exec node "$(find_server)"
    ;;
  worker)
    echo "The worker entrypoint arrives in Section 1." >&2
    exit 64
    ;;
  genie-ops)
    shift
    exec genie-ops "$@"
    ;;
  *)
    echo "Unknown entrypoint: $1. Use app or genie-ops." >&2
    exit 64
    ;;
esac
