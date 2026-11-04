import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ComponentProps } from "react";
import { expect, fn, spyOn, userEvent, waitFor, within } from "storybook/test";

import { AppError, CORE_ERRORS } from "../../lib/errors/index.ts";
import type { AgentArtifact } from "../../services/agent/index.ts";
import type { PanelConfig } from "../../services/charts/panel-config.ts";
import { ArtifactPanel } from "./artifact-panel.tsx";
import { ChartCheckProvider, type CheckChart } from "./chart-check.tsx";

const BAR = {
  type: "bar",
  title: "Quantity by record",
  series: [
    {
      name: "Quantity",
      dataset: "example.items",
      query: { limit: 10 },
      x: "label",
      y: "quantity",
    },
  ],
} as const satisfies PanelConfig;

const LINE = {
  ...BAR,
  type: "line",
  title: "Quantity by day",
} as const satisfies PanelConfig;

const TABLE = {
  type: "table",
  title: "Balances",
  series: [
    {
      name: "Balances",
      dataset: "example.items",
      query: { select: ["name", "balance"] },
    },
  ],
} as const satisfies PanelConfig;

const CHART_ID = "11111111-1111-4111-8111-111111111111";

const TABLE_ID = "22222222-2222-4222-8222-222222222222";

const ARTIFACTS: readonly AgentArtifact[] = [
  {
    id: CHART_ID,
    number: 1,
    kind: "chart",
    title: "Quantity by day",
    latestVersion: 2,
    versions: [
      {
        version: 1,
        definition: BAR,
        request: "Chart the quantity",
        createdAt: "2026-11-05T08:00:00Z",
      },
      {
        version: 2,
        definition: LINE,
        request: "Show it as a line",
        createdAt: "2026-11-05T08:01:00Z",
      },
    ],
  },
  {
    id: TABLE_ID,
    number: 2,
    kind: "table",
    title: "Balances",
    latestVersion: 1,
    versions: [
      {
        version: 1,
        definition: TABLE,
        request: "List the balances",
        createdAt: "2026-11-05T08:02:00Z",
      },
    ],
  },
];

const READ_AT = "2026-11-05T08:05:00Z";

/** The gate's answer: the numbers come from here, never from the stored definition. */
const draw: CheckChart = async (config) => {
  // SAFETY: the stories pass only the three configs above.
  const panel = config as PanelConfig;

  if (panel.type === "table") {
    return {
      config: panel,
      data: {
        kind: "table",
        title: panel.title,
        columns: [
          { key: "name", label: "Name", type: "text" },
          { key: "balance", label: "Balance", type: "money", currency: "EUR" },
        ],
        rows: [
          { name: "Alpha", balance: -650_000 },
          { name: "=1+1", balance: 300 },
        ],
        datasets: ["example.items"],
        readAt: READ_AT,
        truncated: false,
      },
    };
  }

  return {
    config: panel,
    data: {
      kind: panel.type,
      title: panel.title,
      x: { key: "label", label: "Record", type: "text" },
      columns: [{ key: "quantity", label: "Quantity", type: "number" }],
      rows: [
        { label: "Alpha", quantity: 3 },
        { label: "Beta", quantity: 5 },
      ],
      datasets: ["example.items"],
      readAt: READ_AT,
      truncated: false,
    },
  };
};

/** The gate now refuses the bar config of version 1, as after a release removed its field. */
const refuseBar: CheckChart = async (config) => {
  // SAFETY: the stories pass only the three configs above.
  if ((config as PanelConfig).type === "bar") {
    throw new AppError(CORE_ERRORS["chart-invalid"], {
      issues: [
        {
          path: "series.0.y",
          message: 'Field "quantity" is not in the dataset.',
        },
      ],
    });
  }

  return draw(config);
};

const check = fn(draw);

type PanelProps = ComponentProps<typeof ArtifactPanel>;

/** The frame's state: the panel is controlled, so the story keeps the shown version. */
function Framed(props: PanelProps) {
  const [shown, setShown] = useState(props.shown);

  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );

  return (
    <QueryClientProvider client={client}>
      <ChartCheckProvider check={check} timeZone="UTC">
        <div style={{ width: 480, height: 640 }}>
          <ArtifactPanel
            {...props}
            shown={shown}
            onShow={(ref) => {
              props.onShow(ref);
              setShown(ref);
            }}
          />
        </div>
      </ChartCheckProvider>
    </QueryClientProvider>
  );
}

/**
 * The artifact panel of Ask: one version of one artifact of the chat, drawn through the chart gate
 * as the viewer, with its versions, the chat's other artifacts, and its rows to copy or download.
 */
const meta = {
  title: "Core/Agent/ArtifactPanel",
  component: ArtifactPanel,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'An artifact of the chat (R-45a, `DEC-56`). The panel is controlled: `shown` names the artifact and version, and `onShow` asks the frame for another. The kind registry draws the body; chart and table go through the chart gate, so the figures are the viewer\'s own. "Copy the rows" puts the rows on the clipboard as tab-separated text, and "Download the rows" saves them as CSV with formula cells escaped. `variant` `column` closes with "Close the artifact"; `sheet` goes "Back to the chat".',
      },
    },
    a11y: { test: "error" },
  },
  render: (args) => <Framed {...args} />,
  beforeEach: () => {
    check.mockImplementation(draw);
  },
  args: {
    artifacts: ARTIFACTS,
    shown: { artifactId: CHART_ID, version: 2 },
    onShow: fn(),
    onClose: fn(),
    variant: "column",
  },
} satisfies Meta<typeof ArtifactPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const StepsBetweenVersions: Story = {
  name: "Steps between versions",
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Version 2 of 2")).toBeVisible();
    await expect(
      await canvas.findByRole("figure", { name: "Quantity by day" })
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Next version" })
    ).toBeDisabled();

    await userEvent.click(
      canvas.getByRole("button", { name: "Previous version" })
    );

    await expect(await canvas.findByText("Version 1 of 2")).toBeVisible();
    // The body draws version 1's own config, not only a new label.
    await expect(
      await canvas.findByRole("figure", { name: "Quantity by record" })
    ).toBeVisible();
    await waitFor(() => expect(check).toHaveBeenLastCalledWith(BAR));
    await expect(
      canvas.getByText('Version 1, made for "Chart the quantity"')
    ).toBeVisible();
  },
};

export const EveryArtifactOfTheChat: Story = {
  name: "Every artifact of the chat",
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole("heading", { level: 2, name: "Quantity by day" })
    ).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: "All artifacts in this chat" })
    );

    const menu = within(canvasElement.ownerDocument.body);

    const first = await menu.findByRole("menuitem", {
      name: "Quantity by day",
    });

    // The menu fades in, so its items become visible a moment after they mount.
    await waitFor(() => expect(first).toBeVisible());
    await userEvent.click(menu.getByRole("menuitem", { name: "Balances" }));

    await expect(
      await canvas.findByRole("heading", { level: 2, name: "Balances" })
    ).toBeVisible();
    await expect(canvas.getByText(/2 of 2 in this chat/)).toBeVisible();
  },
};

export const Copy: Story = {
  args: { shown: { artifactId: TABLE_ID, version: 1 } },
  play: async ({ canvas }) => {
    const writeText = spyOn(navigator.clipboard, "writeText").mockResolvedValue(
      undefined
    );

    const copy = canvas.getByRole("button", { name: "Copy the rows" });

    await waitFor(() => expect(copy).toBeEnabled());
    await userEvent.click(copy);

    // Money as the table shows it, a negative amount as a number, a formula cell escaped.
    await expect(writeText).toHaveBeenCalledWith(
      'Name\tBalance\r\nAlpha\t-6,500.00\r\n"\'=1+1"\t3.00'
    );
    await expect(await canvas.findByText("Rows copied")).toBeVisible();
  },
};

export const AVersionTheGateRefuses: Story = {
  name: "A version the gate refuses",
  args: { shown: { artifactId: CHART_ID, version: 1 } },
  beforeEach: () => {
    check.mockImplementation(refuseBar);
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("This chart could not be drawn.")
    ).toBeVisible();
    await expect(
      canvas.getByText('Field "quantity" is not in the dataset.')
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Next version" }));

    await expect(await canvas.findByText("Version 2 of 2")).toBeVisible();
    await expect(await canvas.findByRole("figure")).toBeVisible();
    await expect(
      canvas.queryByText("This chart could not be drawn.")
    ).not.toBeInTheDocument();
  },
};

export const AsASheet: Story = {
  name: "As a sheet",
  args: { variant: "sheet" },
  play: async ({ args, canvas }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Back to the chat" })
    );

    await expect(args.onClose).toHaveBeenCalled();
  },
};

export const AKindWithNoView: Story = {
  name: "A kind with no view",
  args: {
    artifacts: [
      {
        id: CHART_ID,
        number: 1,
        kind: "document",
        title: "Notes",
        latestVersion: 1,
        versions: [
          {
            version: 1,
            definition: BAR,
            request: null,
            createdAt: "2026-11-05T08:00:00Z",
          },
        ],
      },
    ],
    shown: { artifactId: CHART_ID, version: 1 },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("This artifact cannot be shown here yet.")
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Copy the rows" })
    ).toBeDisabled();
    await expect(canvas.getByText("Version 1")).toBeVisible();
  },
};
