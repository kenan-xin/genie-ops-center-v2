# Testing

Test-only helpers that measure a design rule in a real browser. The story tests and the end-to-end route walks import them through a `@genie/ui/testing/*` export.

## What belongs here

A function that runs in the page and measures one rule of the design system, its allow list, and the code that turns its measurements into failure lines. A function that `page.evaluate` sends to the browser imports nothing and calls nothing outside its own body.

## What must not go here

Anything product code imports, test fixtures of one screen, and any import of an internal project.
