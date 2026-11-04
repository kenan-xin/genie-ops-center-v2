import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import { ArtifactCard } from "./artifact-card.tsx";

const ARTIFACT = {
  artifactId: "11111111-1111-4111-8111-111111111111",
  version: 2,
  toolCallId: "call-chart",
  kind: "chart" as const,
  title: "Quantity by record",
};

/**
 * One artifact an answer made: its kind, title and version. In Ask it opens the artifact panel and
 * marks the shown version; in the agent panel it links to Ask; while its answer streams it waits.
 */
const meta = {
  title: "Core/Agent/ArtifactCard",
  component: ArtifactCard,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'The card of a chart or a table an answer made (R-45a, AG24). `action` `panel` opens the artifact panel in Ask ("Open", or "Showing" with `aria-pressed` for the shown version); `link` goes to the artifact in Ask. Until its answer is stored, the card reads "Ready when the answer ends" and is disabled.',
      },
    },
    a11y: { test: "error" },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 360 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    artifact: ARTIFACT,
    action: { kind: "panel", shown: null, onOpen: fn() },
    ready: true,
  },
} satisfies Meta<typeof ArtifactCard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const InAsk: Story = { name: "In Ask" };

export const Showing: Story = {
  args: {
    action: {
      kind: "panel",
      shown: { artifactId: ARTIFACT.artifactId, version: 2 },
      onOpen: fn(),
    },
  },
};

export const InThePanel: Story = {
  name: "In the panel",
  args: { action: { kind: "link", href: () => "/ask/chat-1" } },
};

export const WhileTheAnswerStreams: Story = {
  name: "While the answer streams",
  args: { ready: false },
  play: async ({ canvas }) => {
    const card = canvas.getByRole("button", { name: /^Quantity by record/ });

    await expect(card).toBeDisabled();
    await expect(card).toHaveTextContent("Ready when the answer ends");
  },
};
