# List header

The one configurable header of a module list (Spec 7 R-37a, variant C of the list filter prototype): figures, status tabs with counts, a filter bar from filter definitions, actions, and the table under them.

## What belongs here

The plain-data definitions of a list, its state in the page address, the filter controls, the bar, the phone Filters sheet, the figure card, the header that composes them, and their stories. The stories are the specification and the browser behavior tests.

## What must not go here

Business logic, data fetching, a list of one module, and any import of an internal project. A list is a configuration that its module passes in. A filter kind that the built-in kinds do not cover is registered by the page through the `controls` prop, never added here for one list.

## Behavior it guarantees

- A definition is plain data with no function, so a client page and a server loader import the same object.
- The address holds one parameter per filter id, the tab parameter and `sort`. An old or hand-edited value reads as no value, or as the default sort.
- In the bar a trigger shows its label muted and its value semibold, with the control border; a set value tints the trigger (variant A, `czjw.102`). In the Filters sheet and More filters a placeholder is muted and regular, a set value tinted and semibold.
- Clear filters shows only while a filter or the search is set, right after the last control. The actions sit at the end of the bar.
- Clear filters gives the focus to the first control of the bar, and Clear all in the Filters sheet gives it to Show.
- The tab row, the bar and the table share one 20 px left edge.
- Every control of one place has one height: the field height, 36 px from 1024 px and 44 px under it.
- A phone shows the count once, in the line above the cards.
- The controls that do not fit the bar move into More filters, in definition order. Below 768 px every filter sits in the Filters sheet.
- A phone header can show the applied filters as chips in one row that scrolls sideways. A chip's remove button has a 44 px target, and a remove moves the focus to the next chip, else the previous one, else the row.
