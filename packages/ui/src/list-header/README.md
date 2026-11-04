# List header

The one configurable header of a module list (Spec 7 R-37a, variant C of the list filter prototype): figures, status tabs with counts, a filter bar from filter definitions, actions, and the table under them.

## What belongs here

The plain-data definitions of a list, its state in the page address, the filter controls, the bar, the phone Filters sheet, the figure card, the header that composes them, and their stories. The stories are the specification and the browser behavior tests.

## What must not go here

Business logic, data fetching, a list of one module, and any import of an internal project. A list is a configuration that its module passes in. A filter kind that the built-in kinds do not cover is registered by the page through the `controls` prop, never added here for one list.

## Behavior it guarantees

- A definition is plain data with no function, so a client page and a server loader import the same object.
- The address holds one parameter per filter id, the tab parameter and `sort`. An old or hand-edited value reads as no value, or as the default sort.
- A placeholder is muted and regular, a set value tinted and semibold.
- Every control of one place has one height: 44 px under 1024 px.
- The controls that do not fit the bar move into More filters, in definition order. Below 768 px every filter sits in the Filters sheet.
