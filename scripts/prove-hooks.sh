#!/usr/bin/env sh
# Proves what the tracked Git hook dispatchers in .githooks/ do, inside a
# throwaway Git repository under the temporary directory. It never writes to
# this checkout, it never changes this repository's core.hooksPath, and it never
# runs Beads or any remote command: the Beads hooks of the throwaway repository
# are stubs that only record that they ran.
#
# Isolation: every Git command runs with GIT_CONFIG_GLOBAL and GIT_CONFIG_SYSTEM
# pointing at files this script writes, and with an empty template directory, so
# no hook configured on the caller's machine can fire. The temporary global file
# names a sentinel hooks directory on purpose. Case 0 proves the sentinel never
# runs, which is the negative control for that isolation.
#
# Usage, from the repository root:
#   sh scripts/prove-hooks.sh
#
# Lefthook is the real binary pinned in package.json. The script looks for
# LEFTHOOK_BIN, then node_modules/.bin/lefthook, then lefthook on PATH. It makes
# the path absolute and refuses any other version, so the transcript cannot
# claim a version it did not run.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
pinned=$(sed -n 's/.*"lefthook": "\([^"]*\)".*/\1/p' "$root/package.json" | head -1)
[ -n "$pinned" ] || { echo "no lefthook version pinned in package.json" >&2; exit 1; }

work=$(mktemp -d "${TMPDIR:-/tmp}/hook-proof.XXXXXX")
trap 'rm -rf "$work"' EXIT
repo="$work/repo"
sentinel="$work/sentinel-hooks"
failures=0

# Absolute path of an executable, whether it was given relatively or by name.
resolve() {
  case "$1" in
    */*) [ -x "$1" ] || return 1; printf '%s/%s\n' "$(cd "$(dirname "$1")" && pwd)" "$(basename "$1")" ;;
    *) command -v "$1" || return 1 ;;
  esac
}

lefthook_bin=${LEFTHOOK_BIN:-}
if [ -z "$lefthook_bin" ] && [ -x "$root/node_modules/.bin/lefthook" ]; then
  lefthook_bin="$root/node_modules/.bin/lefthook"
fi
[ -n "$lefthook_bin" ] || lefthook_bin=$(command -v lefthook || true)
if [ -z "$lefthook_bin" ]; then
  echo "no lefthook binary found; run pnpm install --frozen-lockfile or set LEFTHOOK_BIN" >&2
  exit 1
fi
lefthook_bin=$(resolve "$lefthook_bin") || { echo "LEFTHOOK_BIN is not an executable file: $lefthook_bin" >&2; exit 1; }
lefthook_version=$("$lefthook_bin" --version 2>/dev/null | awk '{print $3}')
if [ "$lefthook_version" != "$pinned" ]; then
  echo "lefthook $lefthook_bin reports version '$lefthook_version'; package.json pins $pinned" >&2
  exit 1
fi

# Git isolation. The sentinel hook must never run; case 0 checks that.
mkdir -p "$sentinel"
printf '#!/bin/sh\ntouch "%s/sentinel.ran"\n' "$work" >"$sentinel/pre-commit"
chmod +x "$sentinel/pre-commit"
mkdir -p "$work/empty-template"
printf '[core]\n\thooksPath = %s\n' "$sentinel" >"$work/gitconfig"
: >"$work/gitconfig-system"
GIT_CONFIG_GLOBAL="$work/gitconfig"
GIT_CONFIG_SYSTEM="$work/gitconfig-system"
export GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM

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
git init -q --template="$work/empty-template" "$repo"
# No hook may run before the proof says so, not even the seed commit's.
mkdir -p "$work/no-hooks"
git -C "$repo" config core.hooksPath "$work/no-hooks"
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

printf 'lefthook:    %s (pinned %s)\n' "$lefthook_bin" "$pinned"
printf 'dispatchers: %s\n' "$(ls "$root/.githooks" | tr '\n' ' ')"
printf 'throwaway:   %s\n' "$repo"

# Case 0: the negative control. The seed commit ran with the sentinel hooks
# directory configured globally, and the sentinel must not have run.
say "case 0: no hook of the caller's machine runs, seed commit included"
expect "sentinel did not run" "absent" "$([ -e "$work/sentinel.ran" ] && echo present || echo absent)"
expect "seed produced no hook output" "" "$(cat "$repo/ran.log")"

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

say "case 7: the sentinel never ran, from the first command to the last"
expect "sentinel did not run" "absent" "$([ -e "$work/sentinel.ran" ] && echo present || echo absent)"

# Cases 8 and 9 check this script's own binary selection, by running it again
# with a deliberately bad and a deliberately relative LEFTHOOK_BIN.
if [ "${HOOK_PROOF_CHILD:-}" != "1" ]; then
  say "case 8: a lefthook of another version is refused"
  printf '#!/bin/sh\necho "lefthook version 1.0.0 fake"\n' >"$work/fake-lefthook"
  chmod +x "$work/fake-lefthook"
  status=0
  HOOK_PROOF_CHILD=1 LEFTHOOK_BIN="$work/fake-lefthook" sh "$root/scripts/prove-hooks.sh" >"$work/case8.out" 2>&1 || status=$?
  expect "exit status" "1" "$status"
  expect "version named" "found" "$(found "package.json pins $pinned" "$work/case8.out")"

  say "case 9: a relative LEFTHOOK_BIN resolves to a working absolute path"
  mkdir -p "$work/rel"
  ln -sf "$lefthook_bin" "$work/rel/lefthook"
  status=0
  (cd "$work" && HOOK_PROOF_CHILD=1 LEFTHOOK_BIN=rel/lefthook sh "$root/scripts/prove-hooks.sh" >"$work/case9.out" 2>&1) || status=$?
  expect "exit status" "0" "$status"
  expect "all cases passed" "found" "$(found 'all cases passed' "$work/case9.out")"
fi

printf '\n'
if [ "$failures" -eq 0 ]; then
  echo "all cases passed"
else
  echo "$failures check(s) failed"
  exit 1
fi
