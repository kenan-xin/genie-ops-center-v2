# S0-05 native composition spike

Bead: `genie-ops-center-v2-1rd.5`. Branch `feature/s0-05-production-startup-csp`, base develop `7037ca4`. Recorded 2026-09-21. Revision 3.

This document records a throwaway experiment, not ticket acceptance. It closes no acceptance criterion. G2 stays open until the actual built image passes the amended acceptance matrix, with real database and browser proof.

Revision 2 corrected three errors in revision 1. Revision 1 claimed that the native composition satisfies the startup contract, proposed a file tracing include, and understated the redirect gap.

Revision 3 corrects two further errors that independent verification found in revision 2, and records the amendments the owner approved.

| Revision 2 statement | Correction in revision 3 |
| --- | --- |
| The normalization redirect carries no body | The response body is the normalized destination URL. Measured at 7, 9 and 19 bytes |
| Changing the bind order needs a custom server | A same-process wrapper or preload is also possible. It needs separate packaging and shared-context proof, so it is an open alternative, not a ruled-out one |

## Versions and method

| Item | Value |
| --- | --- |
| Next.js | 16.3.5, Turbopack build |
| Node.js | 26.9.0 |
| React | 19.3.0 |
| Probe | a temporary application under the worktree, resolving the workspace `next` binary |

The probe used the same shapes the real application uses: a bootstrap hook, a proxy file, App Router pages, route handlers, static assets and redirects. A timer stood in for environment validation, context creation and migrations. A counter recorded how many times the bootstrap ran.

Two terms carry the findings. A *bundle* is one compiled output that the framework loads separately at run time. A *module instance* is one evaluation of a source file inside a bundle, identified by a value created at evaluation time.

### Timing provenance

Revision 1 reported a 6000 millisecond migration that appeared to finish at 5539 milliseconds. That was a measurement error, not a framework behavior. Revision 1 measured elapsed time from process launch, while the migration timer started later, inside the bootstrap. The two origins differed by the process startup cost.

Revision 2 removes the error. The server writes each bootstrap event to a log with a wall-clock reading and a monotonic reading. The client writes each request start and end with the same machine clock. Every table below is expressed relative to the recorded `bootstrap:start` event. The client also sends raw requests and never follows a redirect.

## Finding 1: the listener accepts connections before migrations finish

This is the correction that matters most. Revision 1 reported this data and drew the wrong conclusion from it.

The probe polled with a raw socket connection and an HTTP request, against the standalone build, with a 5000 millisecond migration.

```text
request_start  request_end  tcp         http     body
         -169         -167  refused     ECONNREFUSED
           83          988  accepted    timeout
         1239         2140  accepted    timeout
         2392         3294  accepted    timeout
         3546         4447  accepted    timeout
         4699         5054  accepted    200      ok
```

```text
process spawned  : -172 ms
bootstrap:start  :    0 ms
bootstrap:end    : 5002 ms   (declared 5000 ms)
```

The socket accepted a connection at 83 milliseconds, about five seconds before migrations finished. R-19b, AC-26 and ADR 0008 require migrations to complete *before the application listens*. The observed behavior does not meet that wording.

What the framework does meet is a narrower statement. No application code ran before the bootstrap finished:

```text
earliest application handling : +5044 ms
bootstrap ended at            : +5002 ms
```

The five requests that the client abandoned were queued, not rejected. The server handled all five at +5044 milliseconds, after the bootstrap completed. The proxy and the route handler both record their own entry, so these timestamps show when application code actually ran.

The cause is in the installed framework. `dist/server/lib/start-server.js` binds the socket before it initializes, and gates request handling behind an initialization promise. No configuration option changes that order.

Two alternatives exist if binding must follow initialization. A custom server changes that order, and the ticket forbids it. A same-process wrapper or preload that initializes before the framework binds is also possible, and it is not ruled out here. It would need its own packaging proof and its own shared-context proof, neither of which this spike ran. Revision 2 wrongly stated that only a custom server could change the order.

The bootstrap hook is the framework's supported request-initialization mechanism. A separate migration process would add its own lifecycle and context ownership, and the ticket already says that a separate migration process alone does not prove context reuse.

## Finding 2: one context is shared by every request path

The build reports that one shared source file compiles into five separate bundles: App Route, Edge Instrumentation, Instrumentation, Middleware and Server Component. That listing shows which bundles exist. It does not prove how many contexts run. The evidence for the context count is the measurement below.

The probe published the context under a process-global key. Measured against the standalone build:

| Request path | Module instance | Context token | Constructions |
| --- | --- | --- | --- |
| Route handler | `61d2167e` | `a8c9d138` | 1 |
| Proxy | `7668597b` | `a8c9d138` | 1 |
| Ordinary page | `a2b0a575` | `a8c9d138` | 1 |
| Viewer page | `a2b0a575` | `a8c9d138` | 1 |

Three distinct module instances appear, which shows that a module-level variable does not reach across these paths. The page and the viewer share one Server Component bundle, so they report one instance. The context token is identical everywhere and the construction count stays at one.

Twenty-four concurrent requests spread across the page, the route handler and the viewer returned one distinct context token, one process id and a construction count of one.

This evidence is process-scoped. It shows one context inside one process. It says nothing about more than one process, which the deployment does not use.

## Finding 3: a failed bootstrap does not exit by itself

| Bootstrap behavior | Process outcome |
| --- | --- |
| `register()` throws | Logs `Failed to prepare server` and an unhandled rejection, then keeps running. Still alive after 30 seconds |
| `register()` runs bounded cleanup, then exits | Exit code 1 after 168 milliseconds |
| Cleanup and log flush both never settle | Each budget expires, then exit code 1 after 2582 milliseconds |

The third row answers the reviewer's question directly. Cleanup and redacted log flushing each run under their own time budget. When both hang, the budgets expire at 1201 and 2407 milliseconds and the process still exits nonzero:

```text
   +0ms  bootstrap:failed
+1201ms  cleanup:budget-expired
+2407ms  logflush:budget-expired
+2407ms  bootstrap:exiting code=1
```

Bounded cleanup therefore cannot prevent nonzero termination. The application bootstrap must catch its own failure rather than throw.

## Finding 4: the wasm failure came from test mode, and the tracing include is withdrawn

Revision 1 hit this error on its first standalone run and proposed a file tracing include as the fix:

```text
ENOENT: no such file or directory, open
  '.../next/dist/compiled/@mswjs/interceptors/ClientRequest/llhttp/llhttp.wasm'
```

The installed framework excludes that asset on purpose. `dist/build/collect-build-traces.js` carries the reason in a comment: the test-mode interceptor bundle reads its parser asset through a computed path, and test proxying is not supported in standalone output, so the asset is kept out of production traces.

A causal test settles it. With `experimental.testProxy` set to `true`, the standalone server reproduces the exact error. With a clean production configuration it does not:

| Configuration | Wasm files traced | Standalone server |
| --- | --- | --- |
| Clean production | 0 | starts, serves, shares one context, emits the viewer policy |
| `experimental.testProxy: true` | 0 | fails at startup with the ENOENT above |

The proposed tracing include is withdrawn. It would have papered over an unsupported mode rather than fixing anything. The real application must never set `experimental.testProxy`, and must never set `NEXT_PRIVATE_TEST_PROXY`, because `dist/server/next-server.js` loads the test-mode server whenever the option is on, and `dist/server/web/adapter.js` loads the edge test-mode server whenever the environment variable is `true`.

One limit is honest to state. Revision 1 did not set that option, so the original trigger is not established. What is established is that a clean production configuration traces zero wasm files and runs correctly, and that the only reproduced trigger is the unsupported test mode. The retained work adds a guard test that asserts the built image starts and that no test-mode asset is required.

Browser-level request interception in end-to-end tests is a separate mechanism and is unaffected by this finding.

## Finding 5: framework-generated redirects carry no headers

Revision 1 reported that a redirect from the framework configuration carried no headers, and proposed moving application redirects into the proxy. That proposal is correct as far as it goes, and it does not establish coverage, because the framework generates redirects of its own.

Measured against the standalone server, with redirects never followed:

| Request | Status | Standard headers | Policy count | Proxy ran |
| --- | --- | --- | --- | --- |
| Ordinary document | 200 | 5 of 5 | 1 | yes |
| Route handler | 200 | 5 of 5 | 1 | yes |
| Health | 200 | 5 of 5 | 1 | yes |
| Not found | 404 | 5 of 5 | 1 | yes |
| Public asset | 200 | 5 of 5 | 1 | yes |
| Compiled JavaScript chunk | 200 | 5 of 5 | 1 | yes |
| Viewer document | 200 | 5 of 5 | 1 | yes |
| Trailing slash, `/viewer/` | 308 | 0 of 5 | 0 | no |
| Repeated slash, `//viewer` | 308 | 0 of 5 | 0 | no |
| Repeated slash, `/viewer//x` | 308 | 0 of 5 | 0 | no |
| Backslash, `/\viewer` | 308 | 0 of 5 | 0 | no |
| Double backslash | 308 | 0 of 5 | 0 | no |
| Application redirect from the proxy | 307 | 5 of 5 | 1 | yes |

### What the normalization responses actually contain

Revision 2 called these responses empty. They are not. Each one carries the normalized destination URL as its body, with no content type header:

| Request path | Status | Location | Body bytes | Body text |
| --- | --- | --- | --- | --- |
| `//viewer` | 308 | `/viewer` | 7 | `/viewer` |
| `/viewer//x` | 308 | `/viewer/x` | 9 | `/viewer/x` |
| `/\viewer` | 308 | `/viewer` | 7 | `/viewer` |
| `/\\viewer` | 308 | `/viewer` | 7 | `/viewer` |
| `//external.example/x` | 308 | `/external.example/x` | 19 | `/external.example/x` |

The last row matters. A path that looks like another origin is normalized to a relative, same-origin path. The response never sends a client to another origin.

The application redirect behaves the same way about the body. Its 307 carries `/` as a one-byte body, and it carries all five headers.

The normalized destination then answers with full coverage. `/viewer` returns 200 with five of five headers, and `/viewer/x` returns 404 with five of five headers.

Two separate causes appear in `dist/server/lib/router-utils/resolve-routes.js`.

The first is URL normalization. At the top of the route resolver, before the configured headers and before the proxy, a path containing a backslash or a repeated slash returns a 308 at once:

```js
if (urlNoQuery?.match(/(\\|\/\/)/)) {
    parsedUrl = parseUrl(normalizeRepeatedSlashes(req.url));
    return { parsedUrl, resHeaders, finished: true, statusCode: 308 };
}
```

That branch is unconditional. No configuration option disables it.

The second is the redirect branch itself. When the resolver handles a redirect it returns `resHeaders: null`, which discards any headers matched earlier in the same pass. That is why a configured header rule never reaches a redirect response.

One of the four cases has a supported fix. Setting `skipTrailingSlashRedirect` to `true` removes the framework's trailing-slash redirect, and the application then answers that path itself. Both spellings of a route then receive the same policy:

| Request | Status | Standard headers | Policy |
| --- | --- | --- | --- |
| `/viewer` | 200 | 5 of 5 | viewer |
| `/viewer/` | 200 | 5 of 5 | viewer |
| `/` | 200 | 5 of 5 | baseline |
| An unknown path with a trailing slash | 404 | 5 of 5 | baseline |

The repeated-slash and backslash cases remain.

## Finding 6: a prefix match on the viewer route is a defect

The probe matched the viewer route with a path prefix. Under that rule, `/viewer/x` returned 404 and still carried the viewer policy, because the prefix matched a path that no viewer route serves.

The retained implementation must use the server-owned route mapping that R-49 already requires, matching an actual viewer route rather than a prefix. Acceptance must include a path under the viewer prefix that is not a viewer route, and must assert that it receives the deny baseline.

## Approved amendments

The integration owner approved both amendments on 2026-09-21. The canonical wording lives in the specification, ADR 0008, the technical plan and this ticket. The text below records what the owner approved and why. Approval of an amendment is not acceptance of an implementation. G2 stays open.

### Amendment A: startup ordering

Affects R-19b, AC-26 and ADR 0008.

1. Environment validation must precede every database connection.
2. Successful migrations must precede request-bound handlers, page rendering, tRPC operations and viewer-provider execution.
3. Early socket binding and connection acceptance are permitted, including before invalid configuration is detected.
4. Readiness means a successful designated HTTP health response. Neither transport connectivity nor the framework's ready log line is readiness.
5. A bootstrap failure must exit nonzero within one defined total budget that covers diagnostics, cleanup and logger flushing.
6. A client timeout or disconnect does not cancel a queued request. The server can still handle it after the bootstrap completes.

Point 6 is measured behavior, not an assumption. Five requests that the probe client abandoned during the migration window were all handled at +5044 milliseconds, after the bootstrap finished.

The wording deliberately avoids saying that no application code runs before the bootstrap succeeds. The bootstrap is itself application code. What is gated is request-bound work.

### Amendment B: redirect header coverage

Affects R-47, R-48, R-50 and their acceptance criteria.

1. Application-generated redirects keep complete header coverage: all five headers and exactly one policy. The proxy supplies these.
2. The application sets `skipTrailingSlashRedirect`, and both the slash and the non-slash spelling of a route receive the correct baseline or viewer policy.
3. A narrow exception applies at the application server for the framework's unavoidable repeated-slash and backslash normalization redirects. The exception does not extend to any other redirect or to any error response.
4. Acceptance asserts the exception rather than ignoring it. For each excluded case it asserts status 308, a same-origin Location, the actual response body, that no application code or provider ran, and that the normalized destination response carries all five headers.

This is an origin-server exception, not a claim that the missing headers do not matter. A missing strict transport or referrer header on a redirect is meaningful. The deployment already places a TLS reverse proxy in front of the application, and public header verification stays in deployment acceptance. See the section below.

## The TLS reverse proxy is architecture, not a workaround

The deployment already requires a TLS reverse proxy. It is not introduced by this spike and it is not a substitute for the exception above.

- Public HTTPS header verification remains part of deployment acceptance, in particular the strict transport header, which a browser only honors over HTTPS.
- No claim is made here that the proxy already supplies headers on normalization redirects. That work is not done, and the existing runbook does not yet cover it.
- Any future edge policy configuration must preserve the one viewer-derived policy. It must not overwrite it and must not append a second, conflicting policy.

## Selected composition

The owner approved this composition on 2026-09-21. Selecting a mechanism is not proving it. Every row still has to pass the amended acceptance matrix on the actual built image.

| Concern | Composition point |
| --- | --- |
| Validation, context creation, migrations | The bootstrap hook, guarded to the Node runtime, dynamically importing the Node-only bootstrap |
| Bootstrap failure | The same hook, with bounded diagnostics, cleanup and log flush under one total budget, then a nonzero exit |
| One shared context | An application-owned seam publishing the context under a process-global key, only after migrations succeed |
| Four static headers and the deny policy | The framework header configuration, on every path |
| Viewer policy | The proxy, on an exact server-owned viewer route mapping, never a path prefix, replacing the frame source |
| Application redirects | The proxy, which attaches the standard headers |
| Trailing slash | `skipTrailingSlashRedirect`, with both spellings proven to receive the correct policy |
| Image | Standalone output, clean configuration, no tracing include, and never test mode |

## Limits of this evidence

- The probe used a timer, not a real database, a real migrator or a real module provider.
- The probe measured header values and counts. It proved no browser behavior. Frame loading, framing denial, hydration and styling remain unproven.
- The probe ran outside a container. The secret-free image build and a second runtime configuration remain unproven.
- Context identity evidence covers one process.
- The original trigger for the wasm failure in revision 1 is not established. Only the test-mode trigger is reproduced. Keep that distinction: one failure is reproduced and explained, the other is unexplained.
- The failure-exit runs prove timer and promise behavior. They do not prove real database cleanup or real log delivery.
- No TLS endpoint, container image or browser was exercised.
- These runs close no acceptance criterion and satisfy no gate.

## What the retained work must carry forward

The probe is temporary. These checks become real tests before it is removed:

1. Startup ordering: validation before any database connection, and migrations before request-bound handling, measured against the built image.
2. Failure termination: a bootstrap failure exits nonzero inside the total budget, including when cleanup and log flushing do not settle.
3. Context sharing: one context across page, route handler, tRPC and viewer paths under concurrent load, with a construction count of one.
4. Redirect behavior: full coverage for application redirects and required response classes, the asserted narrow exception for normalization redirects, and trailing-slash equivalence.
5. Packaging: the clean standalone image starts and serves, with no test-mode asset required.
