import { Tooltip, TooltipContent, TooltipTrigger } from "@genie/ui";

/** A provider object id: a UUID, or one long run of letters and digits with a digit in it. */
const ID_LIKE =
  /^(?:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|(?=.*\d)[a-z0-9]{20,})$/i;

export function looksLikeId(value: string): boolean {
  return ID_LIKE.test(value);
}

/**
 * A group's label as a list shows it. A value that looks like an id shows its first 8 characters
 * and an ellipsis; the tooltip and screen readers get the full value. It never invents a name: the
 * administrator sets a display label on the Groups page (R-24c).
 */
export function GroupName(props: {
  readonly value: string;
  /** Wraps the value in host copy, for example "{group} (group)". */
  readonly format?: (value: string) => string;
}) {
  const format = props.format ?? ((value: string) => value);

  if (!looksLikeId(props.value)) return format(props.value);

  const full = format(props.value);

  return (
    <Tooltip>
      <TooltipTrigger render={<span />}>
        <span aria-hidden="true">{format(`${props.value.slice(0, 8)}…`)}</span>
        <span className="sr-only">{full}</span>
      </TooltipTrigger>
      <TooltipContent>{full}</TooltipContent>
    </Tooltip>
  );
}
