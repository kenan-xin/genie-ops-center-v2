#!/usr/bin/env bash
# PostToolUse: lint the files an edit touched with the repo's oxlint config, so a
# rule failure reaches the agent at edit time instead of at gate:fast.
# Reads woz Edit ({edits:[{file_path}]}) and built-in Edit/Write ({file_path}).
set -uo pipefail

payload=$(cat)
cwd=$(jq -r '.cwd // empty' <<<"$payload")
[ -n "$cwd" ] || cwd=$PWD

declare -A byRoot
while IFS= read -r file; do
  [ -n "$file" ] || continue
  [[ "$file" = /* ]] || file="$cwd/$file"
  [[ "$file" =~ \.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$ ]] || continue
  [[ "$file" == */node_modules/* ]] && continue
  [ -f "$file" ] || continue
  root=$(git -C "$(dirname "$file")" rev-parse --show-toplevel 2>/dev/null) || continue
  [ -x "$root/node_modules/.bin/oxlint" ] && [ -f "$root/oxlint.config.ts" ] || continue
  byRoot["$root"]+="$file"$'\n'
done < <(jq -r '[(.tool_input.edits[]?.file_path), .tool_input.file_path] | map(select(. != null) | sub("#.*$"; "")) | unique | .[]' <<<"$payload")

status=0
for root in "${!byRoot[@]}"; do
  mapfile -t files < <(printf '%s' "${byRoot[$root]}")
  if ! out=$(cd "$root" && node_modules/.bin/oxlint --config oxlint.config.ts --no-error-on-unmatched-pattern "${files[@]}" 2>&1); then
    printf 'oxlint failed on the file you just edited. Fix it now; gate:fast runs the same rules.\n%s\n' "$out" >&2
    status=2
  fi
done
exit $status
