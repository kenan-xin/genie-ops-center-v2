#!/usr/bin/env sh
# Proves what the tracked Git hook dispatchers in .githooks/ do, inside a
# throwaway Git repository under the temporary directory. It never writes to
# this checkout, it never changes this repository's core.hooksPath, and it never
# runs Beads or any remote command: the Beads hooks of the throwaway repository
# are stubs that only record that they ran.
#
# Usage, from the repository root:
#   sh scripts/prove-hooks.sh
#
# Lefthook is the real pinned binary. The script looks for LEFTHOOK_BIN, then
# node_modules/.bin/lefthook, then lefthook on PATH. Without one it stops with
# that reason instead of reporting a pass.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
lefthook_bin=${LEFTHOOK_BIN:-}
if [ -z "$lefthook_bin" ] && [ -x "$root/node_modules/.bin/lefthook" ]; then
  lefthook_bin="$root/node_modules/.bin/lefthook"
fi
if [ -z "$lefthook_bin" ]; then
  lefthook_bin=$(command -v lefthook || true)
fi
if [ -z "$lefthook_bin" ]; then
  echo "no lefthook binary found; run pnpm install --frozen-lockfile or set LEFTHOOK_BIN" >&2
  exit 1
fi

work=$(mktemp -d "${TMPDIR:-/tmp}/hook-proof.XXXXXX")
trap 'rm -rf "$work"' EXIT
repo="$work/repo"
failures=0

say() { printf '\n== %s\n' "$1"; }
expect() { # expect <label> <expected> <actual>
  if [ "$2" = "$3" ]; then
    printf 'ok   %s\n' "$1"
  else
    printf 'FAIL %s\n     expected: %s\n     actual:   %s\n' "$1" "$2" "$3"
    failures=$((failures + 1))
  fi
}
ran() { tr '\n' '|' <"$repo/ran.log" | sed 's/|$//'; }
found() { if grep -q "$1" "$2"; then echo found; else echo missing; fi; }

# A throwaway repository carrying the tracked dispatchers, stub Beads hooks and
# the real Lefthook binary at the path the dispatcher expects.
mkdir -p "$repo"
git init -q "$repo"
git -C "$repo" config user.name proof
git -C "$repo" config user.email proof@example.invalid
git -C "$repo" config commit.gpgsign false
cp -R "$root/.githooks" "$repo/.githooks"
mkdir -p "$repo/.beads/hooks" "$repo/node_modules/.bin"
for name in pre-commit prepare-commit-msg post-merge post-checkout pre-push; do
  printf '#!/bin/sh\necho "beads stub %s" >>ran.log\n' "$name" >"$repo/.beads/hooks/$name"
  chmod +x "$repo/.beads/hooks/$name"
done
ln -s "$lefthook_bin" "$repo/node_modules/.bin/lefthook"
cat >"$repo/lefthook.yml" <<'YAML'
pre-commit:
  parallel: false
  jobs:
    - name: record
      run: sh -c 'echo "lefthook job" >>ran.log'
YAML
: >"$repo/ran.log"
echo seed >"$repo/seed.txt"
git -C "$repo" add -A
git -C "$repo" commit -q -m seed

printf 'lefthook:    %s\n' "$("$lefthook_bin" --version)"
printf 'dispatchers: %s\n' "$(ls "$root/.githooks" | tr '\n' ' ')"
printf 'throwaway:   %s\n' "$repo"

# Case 1: installation. The documented command activates the dispatchers, and
# it changes the throwaway repository only.
say "case 1: hooks:install sets core.hooksPath to the tracked folder"
git -C "$repo" config core.hooksPath .githooks
expect "core.hooksPath" ".githooks" "$(git -C "$repo" config --get core.hooksPath)"

# Case 2: the chain. One commit runs the Beads pre-commit hook, then Lefthook,
# then the Beads prepare-commit-msg hook, in that order.
say "case 2: a commit runs the Beads hook, then Lefthook"
: >"$repo/ran.log"
echo one >"$repo/a.txt"
git -C "$repo" add a.txt
git -C "$repo" commit -q -m "case 2"
expect "commit created" "case 2" "$(git -C "$repo" log -1 --format=%s)"
expect "order" "beads stub pre-commit|lefthook job|beads stub prepare-commit-msg" "$(ran)"

# Case 3: a missing Beads hook blocks the commit loudly.
say "case 3: a missing Beads hook blocks the commit"
mv "$repo/.beads/hooks/pre-commit" "$work/pre-commit.saved"
echo two >"$repo/b.txt"
git -C "$repo" add b.txt
status=0
git -C "$repo" commit -q -m "case 3" >"$work/case3.out" 2>&1 || status=$?
expect "exit status" "1" "$status"
expect "message" "found" "$(found 'hook dispatcher: .* is missing or not executable' "$work/case3.out")"
expect "no commit written" "case 2" "$(git -C "$repo" log -1 --format=%s)"
mv "$work/pre-commit.saved" "$repo/.beads/hooks/pre-commit"

# Case 4: only the pre-commit dispatcher chains Lefthook.
say "case 4: another hook name runs the Beads hook only"
: >"$repo/ran.log"
(cd "$repo" && GIT_DIR=.git ./.githooks/post-merge >"$work/case4.out" 2>&1)
expect "post-merge skips Lefthook" "beads stub post-merge" "$(ran)"

# Case 5: a missing pinned Lefthook blocks the commit and names the remedy.
say "case 5: a missing pinned Lefthook blocks the commit"
mv "$repo/node_modules/.bin/lefthook" "$work/lefthook.saved"
status=0
git -C "$repo" commit -q -m "case 5" >"$work/case5.out" 2>&1 || status=$?
expect "exit status" "1" "$status"
expect "remedy named" "found" "$(found 'pnpm install --frozen-lockfile' "$work/case5.out")"
expect "no commit written" "case 2" "$(git -C "$repo" log -1 --format=%s)"
mv "$work/lefthook.saved" "$repo/node_modules/.bin/lefthook"

# Case 6: the real Lefthook binary decides. A failing job blocks the commit.
say "case 6: a failing real Lefthook job blocks the commit"
cat >"$repo/lefthook.yml" <<'YAML'
pre-commit:
  parallel: false
  jobs:
    - name: refuse
      run: sh -c 'exit 1'
YAML
git -C "$repo" add lefthook.yml b.txt
status=0
git -C "$repo" commit -q -m "case 6" >"$work/case6.out" 2>&1 || status=$?
expect "exit status" "1" "$status"
expect "no commit written" "case 2" "$(git -C "$repo" log -1 --format=%s)"

printf '\n'
if [ "$failures" -eq 0 ]; then
  echo "all cases passed"
else
  echo "$failures check(s) failed"
  exit 1
fi
