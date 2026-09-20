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
const { entry } = require('./graft-resolve.cjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hooks-test-'));
const clean = { ...process.env };
delete clean.GRAFT_CLAUDE_DIR;
delete clean.IMPECCABLE_BIN;

// An installed copy of the package, for the version the caller asks for.
function install(base, version) {
  const root = path.join(base, 'node_modules', '@nanonets', 'graft');
  const dist = path.join(root, 'dist', 'claude');
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@nanonets/graft', version }));
  fs.writeFileSync(path.join(dist, 'hooks.js'), 'export const main = () => {};\n');
  return dist;
}

// graft: the configured directory wins even against a newer discovered install.
const project = path.join(tmp, 'project');
const newerInstall = install(project, '9.9.9');
const olderInstall = install(path.join(tmp, 'configured'), '0.1.0');
process.env.CLAUDE_PROJECT_DIR = project;
assert.strictEqual(entry('hooks.js'), path.join(newerInstall, 'hooks.js'));
process.env.GRAFT_CLAUDE_DIR = olderInstall;
assert.strictEqual(entry('hooks.js'), path.join(olderInstall, 'hooks.js'));

// graft: a stale configured directory falls back to discovery instead of breaking.
process.env.GRAFT_CLAUDE_DIR = path.join(tmp, 'gone');
assert.strictEqual(entry('hooks.js'), path.join(newerInstall, 'hooks.js'));

// graft: with nothing configured, a missing installation must not break the hook.
delete process.env.GRAFT_CLAUDE_DIR;
process.env.CLAUDE_PROJECT_DIR = tmp;
const guess = entry('hooks.js');
assert.ok(path.isAbsolute(guess));
if (!fs.existsSync(guess)) {
  // Only safe while graft is absent: a present installation would really run.
  execFileSync(process.execPath, [path.join(__dirname, 'graft-hooks.cjs'), 'post-edit'], {
    env: { ...clean, CLAUDE_PROJECT_DIR: tmp, PATH: path.join(tmp, 'nowhere') },
  });
}

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
