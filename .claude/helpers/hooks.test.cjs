#!/usr/bin/env node
'use strict';
// Run: node .claude/helpers/hooks.test.cjs
// Proves that the optional agent hooks find a configured tool and stay silent
// when the tool is absent. Everything runs in a temporary directory, so no hook
// of this checkout is activated.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-test-'));
const clean = { ...process.env };
delete clean.IMPECCABLE_BIN;

// The POSIX command of the Codex hooks, taken from the file the agent reads.
const hooks = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '.codex', 'hooks.json'), 'utf8'));
const command = hooks.hooks.Stop[0].hooks[0].command;
assert.ok(!/\/home\//.test(JSON.stringify(hooks)), 'no home directory path in .codex/hooks.json');

// Codex: a missing tool exits 0 and prints nothing.
const emptyPath = { ...clean, PATH: path.join(tmp, 'nowhere') };
assert.strictEqual(execFileSync('/bin/sh', ['-c', command], { env: emptyPath, encoding: 'utf8' }), '');

// Codex: a configured tool runs.
const stub = path.join(tmp, 'impeccable');
fs.writeFileSync(stub, '#!/bin/sh\necho "ran $1"\n');
fs.chmodSync(stub, 0o755);
const configured = execFileSync('/bin/sh', ['-c', command], { env: { ...emptyPath, IMPECCABLE_BIN: stub }, encoding: 'utf8' });
assert.strictEqual(configured.trim(), 'ran hook');

// Codex: a tool on PATH runs without configuration.
const onPath = execFileSync('/bin/sh', ['-c', command], { env: { ...clean, PATH: tmp }, encoding: 'utf8' });
assert.strictEqual(onPath.trim(), 'ran hook');

// Codex: a stale IMPECCABLE_BIN exits 0 and runs nothing, even with a tool on PATH.
const stale = { ...clean, PATH: tmp, IMPECCABLE_BIN: path.join(tmp, 'gone') };
assert.strictEqual(execFileSync('/bin/sh', ['-c', command], { env: stale, encoding: 'utf8' }), '');

// Codex on Windows: the same rule, checked by reading the command, because this
// check runs no cmd.exe. The variable must be tested with `if exist` before use.
for (const event of ['PostToolUse', 'Stop']) {
  const windows = hooks.hooks[event][0].hooks[0].commandWindows;
  assert.match(windows, /if exist "%IMPECCABLE_BIN%" \("%IMPECCABLE_BIN%" hook\)/, event);
  assert.match(windows, /where impeccable\.cmd/, event);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('ok');
