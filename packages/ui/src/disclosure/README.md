# Disclosure

A summary that shows and hides its content.

## What belongs here

The component, its stories, and nothing else. The stories are the specification: they document the component on its Docs page and they are the browser behavior tests that run under `nx run @genie/storybook:test-storybook`.

## What must not go here

Business logic, data fetching, and any import of an internal project. This is a primitive; it never knows which module renders it.

## Behavior it guarantees

- The trigger is a native `button`, so Enter and Space both toggle it with no key handler of our own.
- The trigger carries `aria-expanded` and `aria-controls`; the content is a labelled `region`.
- The content element is always mounted, so `aria-controls` always names an element that exists. Closed applies the native `hidden` attribute, which removes the content from sight and from the accessibility tree.
- `defaultOpen` sets the initial state only. Each story mounts a fresh instance, which the `StateResets` story proves.
