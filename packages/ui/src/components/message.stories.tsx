import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CheckIcon } from "lucide-react";

import {
  Bubble,
  BubbleContent,
  Marker,
  MarkerContent,
  MarkerIcon,
  Message,
  MessageContent,
} from "../index.ts";
import { iconLeadPx } from "../theme/tokens.ts";

/**
 * The parts of a chat turn, from shadcn (`@shadcn/message`, `bubble`, `marker`, base-nova): a
 * person's message in a muted bubble at the end, a step line, and a plain answer at the start.
 */
const meta = {
  title: "UI/Message",
  component: Message,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          'One chat turn. `Message` lays out a row, `align="end"` for the person. `Bubble` with `variant="muted"` holds the person\'s text; the answer has no bubble. `Marker` is one short muted line, such as a finished step, with an icon in `MarkerIcon` and the words in `MarkerContent`.',
      },
    },
    a11y: { test: "error" },
  },
  render: () => (
    <div className="grid w-96 gap-6">
      <Message align="end">
        <Bubble variant="muted" align="end">
          <BubbleContent>How many items are there?</BubbleContent>
        </Bubble>
      </Message>
      <Message>
        <MessageContent>
          <Marker>
            {/* The check's ink starts 2.1 px into its box (6wz1.113). */}
            <MarkerIcon className={iconLeadPx[2]}>
              <CheckIcon strokeWidth={1.75} />
            </MarkerIcon>
            <MarkerContent>
              Read <b>Items</b>
            </MarkerContent>
          </Marker>
          <p>There are 12 items.</p>
        </MessageContent>
      </Message>
    </div>
  ),
} satisfies Meta<typeof Message>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Turn: Story = {};
