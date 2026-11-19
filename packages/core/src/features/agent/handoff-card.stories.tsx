import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";

import type { AgentRunStatus } from "../../services/agent/runs.ts";
import { AgentClientStub } from "./__fixtures__/agent-client.tsx";
import {
  HANDOFF_CARD,
  HANDOFF_LABELS,
  handoffDetail,
} from "./__fixtures__/handoff.ts";
import { HandoffCard } from "./handoff-card.tsx";

const desktop = { viewport: { value: "desktop1440", isRotated: false } };

const phone = { viewport: { value: "phone390", isRotated: false } };

/**
 * The Ask handoff card (S7-41, prototype `agent-handoff` variant A): the record's title, one live
 * status line, Open, and what Ask passed. It reads the target session each second while it builds.
 */
const meta = {
  title: "Core/Agent/Handoff card",
  component: HandoffCard,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The card under Ask's answer after a handoff: a tile, the record's title, one status line (working, stopping, done, stopped, interrupted, could not finish, or its chat was deleted), and a quiet Open, and the whole row is the link. The fold lists what Ask passed: the goal, the facts, the data with its date, and what it did not pass.",
      },
    },
    a11y: { test: "error" },
    run: "building",
  },
  args: { card: HANDOFF_CARD, labels: HANDOFF_LABELS },
  globals: desktop,
  render: (args, { parameters }) => {
    // SAFETY: each story sets `run` to an AgentRunStatus, null, or "deleted".
    const run = parameters.run as AgentRunStatus | null | "deleted";

    return (
      <AgentClientStub
        session={async () => (run === "deleted" ? null : handoffDetail(run))}
      >
        <div className="max-w-180 p-4">
          <HandoffCard {...args} />
        </div>
      </AgentClientStub>
    );
  },
} satisfies Meta<typeof HandoffCard>;

export default meta;

type Story = StoryObj<typeof meta>;

async function opensTheRecord(canvas: ReturnType<typeof within>) {
  // czjw.202 (C18-3): the link's name is its visible text, so it starts with the title.
  const open = await canvas.findByRole("link", {
    name: /^October placeholder review/,
  });

  await expect(open).toHaveAttribute("href", "/placeholder/r1");

  return open;
}

export const Building: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText("Ask is working")).toBeVisible();
    await opensTheRecord(canvas);
    // G2: the card names no surface (P05-21).
    await expect(canvas.queryByText(/Placeholder agent/)).toBeNull();
  },
};

export const BuildingOnAPhone: Story = { ...Building, globals: phone };

export const Saved: Story = {
  parameters: { run: "saved" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText("Done")).toBeVisible();
    // czjw.202: the whole header row is the link, not a small button.
    const open = await opensTheRecord(canvas);

    await expect(open).toHaveTextContent("October placeholder review");
    await expect(open).toHaveTextContent("Done");
    // WCAG 2.5.3: the live status the person reads is in the link's name too.
    await expect(open).toHaveAccessibleName(
      /^October placeholder review.*Done/
    );
  },
};

export const SavedOnAPhone: Story = { ...Saved, globals: phone };

export const Stopped: Story = {
  parameters: { run: "stopped" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText("Stopped")).toBeVisible();
    await opensTheRecord(canvas);
  },
};

export const StoppedOnAPhone: Story = { ...Stopped, globals: phone };

export const Interrupted: Story = {
  parameters: { run: "interrupted" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      await canvas.findByText("A restart interrupted it")
    ).toBeVisible();
    await opensTheRecord(canvas);
  },
};

export const InterruptedOnAPhone: Story = { ...Interrupted, globals: phone };

// Review Focus 1: the card keeps its title and Open after its chat was deleted.
export const ItsChatWasDeleted: Story = {
  parameters: { run: "deleted" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText("Its chat was deleted")).toBeVisible();
    await expect(canvas.getByText("October placeholder review")).toBeVisible();
    await opensTheRecord(canvas);
    await expect(canvas.queryByText("What Ask passed on")).toBeNull();
  },
};

export const ItsChatWasDeletedOnAPhone: Story = {
  ...ItsChatWasDeleted,
  globals: phone,
};

export const WhatAskPassed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(await canvas.findByText("What Ask passed on"));

    for (const text of [
      "Goal",
      "A short review of the October placeholder records for the board",
      "From this chat",
      "3 records in October",
      "Placeholder records · as of 27 Oct 2026",
      "Not passed",
      "The rest of this chat",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- each line in reading order
      await expect(canvas.getByText(text)).toBeVisible();
    }
  },
};

export const WhatAskPassedOnAPhone: Story = {
  ...WhatAskPassed,
  globals: phone,
};
