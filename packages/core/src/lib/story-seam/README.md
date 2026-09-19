# src/lib/story-seam

The Section 0 Storybook fixture. It exists so the Core group renders in the host before any real core screen exists. Section 1 removes this folder when the first real core screen lands.

## What belongs here

Browser-safe fixtures that prove a group renders. A fixture holds no data access, no registry import, and no environment read, so the host renders it without a database or an identity provider.

## What must not go here

No real screen, no component with a future beyond Section 0. The first real core screen goes in its own folder under `src/lib/`, and this folder goes away.
