# packages/core/src/lib/content-security-policy

The pure content security policy functions of DEC-31 (R-47, R-48).

## What belongs here

The fixed baseline policy, the HTTPS frame-origin validator, the origin normalizer, the serializer that appends validated origins as the only `frame-src` exception, and the provider type and collector a module implements to contribute frame origins. Everything here is pure: no I/O, no state, no clock.

## What must not go here

Header emission on a response (S0-05 owns that), any request read, any database or settings call, and any import from the core runtime. A provider that fails must contribute nothing, so no fallback, wildcard, or broad `https:` source belongs in this folder.

## What it imports

Nothing.
