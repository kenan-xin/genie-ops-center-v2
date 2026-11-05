import type { ListParams } from "@genie/ui";

import {
  type AgentPageContext,
  agentPageContextSchema,
} from "../../services/agent/page-context.ts";
import {
  type DatasetListDefinition,
  listQueryOf,
} from "../../services/datasets/list-query.ts";

type PageList = NonNullable<AgentPageContext["list"]>;

/** A list page's context, and the panel's About text for it. */
export type ListAgentPage = {
  readonly context: AgentPageContext;
  readonly about: string;
};

/**
 * The page context of a list page (I20): its label, its tab, and with a dataset the filters and
 * the sort that `listQueryOf` reads from the address, so the agent can query the rows the page
 * shows. A search that does not fit is left out; anything else that does not fit leaves out the
 * whole list part, so a page state the person did not type never blocks a message.
 */
export function listAgentPage(input: {
  readonly definition: DatasetListDefinition;
  readonly params: ListParams;
  /** The dataset whose rows the list shows; none for a list that is no dataset. */
  readonly dataset?: string;
}): ListAgentPage {
  const { definition, params, dataset } = input;
  const { tabs } = definition;
  const first = tabs?.items[0];

  const active =
    tabs?.items.find((item) => item.value === params[tabs.param]) ?? first;

  const query = listQueryOf(definition, params);

  const list: { -readonly [K in keyof PageList]: PageList[K] } = {};

  if (dataset !== undefined) list.dataset = dataset;

  if (active !== undefined) list.tab = active.value;

  if (dataset !== undefined) {
    const filters = [...query.filters, ...query.tab];

    if (filters.length > 0) list.filters = filters;

    if (query.orderBy.length > 0) list.orderBy = query.orderBy;
  }

  if (query.search !== undefined) list.search = query.search;

  const { search: _search, ...withoutSearch } = list;

  const page = definition.label;

  const context = [{ page, list }, { page, list: withoutSearch }, { page }]
    .map((candidate) => agentPageContextSchema.safeParse(candidate))
    .find((parsed) => parsed.success)?.data ?? { page };

  return {
    context,
    about:
      active === undefined || active === first
        ? page
        : `${page}, ${active.label}`,
  };
}
