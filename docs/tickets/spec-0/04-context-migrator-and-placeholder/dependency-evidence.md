# S0-04 dependency evidence

Bead: `genie-ops-center-v2-1rd.4`. Branch `feature/s0-04-context-migrator`, base `7890530`. Recorded 2026-09-21.

Four dependencies were added, all named by [the technology stack](../../../core/tech-stack.md). No pin, alias, package extension or other pnpm setting changed.

Historical dependency-adoption record. Later database execution is in [ticket evidence](evidence.md); current acceptance limits are in the [integrated review](integrated-review.md). The original `2tc` blocker mentioned below has since closed.

## The four packages

| Package | Version | Canonical range | Published | Placement |
| --- | --- | --- | --- | --- |
| pino | 10.3.1 | 10.x, tech-stack Logging row | 2026-02-09 | `packages/core` dependency |
| testcontainers | 12.1.0 | 12.x, tech-stack Integration tests row | 2026-08-04 | `packages/core` development dependency |
| @testcontainers/postgresql | 12.1.0 | same row, the Postgres module | 2026-08-04 | `packages/core` development dependency |
| drizzle-kit | 0.31.10 | 0.31.x, tech-stack ORM row | 2026-09-09 | root development dependency |

The workspace sets `minimumReleaseAge: 1440` with `minimumReleaseAgeStrict: true`. Every version above was published more than a day before 2026-09-21, so no exception line was added.

None of the four declares a peer dependency at these versions, so `strictPeerDependencies: true` is unaffected. None declares an `os` or `cpu` restriction. None carries an install script of its own. Only testcontainers declares an engine, `node >= 22.22`; this host runs Node 26.9.0.

## Three denied build scripts

testcontainers brings three transitive dependencies that carry build scripts. The workspace refuses an unnamed build script, so each one is named in `allowBuilds` with the value `false`: the script never runs, and the decision stays auditable. The sources below were read in `node_modules/.pnpm` after the install.

### ssh2 1.17.0

`"install": "node install.js"`. The script spawns a build of the package's own optional binding, and `install.js` opens with the comment `Attempt to build the bundled optional binding`. The consumer tolerates its absence: `lib/protocol/crypto.js` line 30 reads

```js
try {
  binding = require('./crypto/build/Release/sshcrypto.node');
  ({ AESGCMCipher, ChaChaPolyCipher, GenericCipher,
     AESGCMDecipher, ChaChaPolyDecipher, GenericDecipher } = binding);
} catch {}
```

The binding is `sshcrypto`, built by ssh2 itself. It is not `cpu-features`.

### cpu-features 0.0.10

`"install": "node buildcheck.js > buildcheck.gypi && node-gyp rebuild"`, a native addon build. Its consumer also tolerates its absence: `ssh2/lib/protocol/constants.js` line 7 reads

```js
let cpuInfo;
try {
  cpuInfo = require('cpu-features')();
} catch {}
```

### protobufjs 7.6.6

`"postinstall": "node scripts/postinstall"`. The script reads the package's own `package.json`, returns at once when `versionScheme` is unset, and otherwise prints a warning about the version scheme a dependent uses. It generates no artifact. The published package already ships the files its build produces.

## Proof

Recorded after the three denials were written.

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm install` | 0 | no `ERR_PNPM_IGNORED_BUILDS` |
| `pnpm install --frozen-lockfile` | 0 | the lockfile matches the manifests |
| import smoke check from `packages/core` | 0 | pino, testcontainers and @testcontainers/postgresql all load with their scripts denied |
| `pnpm exec drizzle-kit --version` | 0 | `drizzle-kit: v0.31.10` |

The import check loads each package and reads one export, so it proves the package is usable without its install script. It proves nothing about a running database: the Docker runtime gap is bead `genie-ops-center-v2-2tc`, and it still blocks the acceptance of this ticket.
