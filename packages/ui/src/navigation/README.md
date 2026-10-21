# Navigation

A labelled list of links to the pages a module registered.

## What belongs here

The component, its stories, and nothing else. The stories are the specification: they document the component on its Docs page and they are the browser behavior tests that run under `nx run @genie/storybook:test-storybook`.

## What must not go here

Business logic, data fetching, routing decisions, and any import of an internal project. The caller decides which entries exist and what each one links to. This component only renders what it is given.

## Behavior it guarantees

- The list is a `nav` labelled with its own heading text, so assistive technology can name the landmark and a test can find it by role and name.
- An empty list renders the supplied message instead of an empty `ul`, so a deployment with no compiled module says so rather than showing nothing.
- Every entry is a plain anchor. There is no hook and no event handler, so the component stays a Server Component and needs no `"use client"` directive.

## What it is not

It is not an access control. Section 0 shows every compiled module's entries, and hiding a link protects nothing. The server enforces every route through `can()` whether or not a link to it is drawn.
