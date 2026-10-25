import type { ThemeName } from "@genie/ui";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import { DEFAULT_MARK_URL } from "../shell/identity-block.tsx";
import { brandingView, imageView, PIXEL } from "./__fixtures__/branding.ts";
import {
  BrandingScreen,
  type BrandingScreenProps,
} from "./branding-screen.tsx";

const phone = { viewport: { value: "mobile1", isRotated: false } };

// The file inputs carry `accept`; a refused type must still reach the screen's own check.
const user = userEvent.setup({ applyAccept: false });

const MARK = imageView();

/**
 * The Branding page (R-43 to R-53): three tabs over one browser draft, a live preview, five
 * contrast checks and one Publish. The host owns the read, the publish and the upload.
 */
const meta = {
  title: "Core/Branding",
  component: BrandingScreen,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "The Branding page. Every edit lands in one browser draft and the preview at once; Publish writes the changed fields in one step, and Discard drops the draft. The host owns the read, the publish and the image upload.",
      },
    },
    a11y: { test: "error" },
  },
  globals: { viewport: { value: "desktop", isRotated: false } },
  args: {
    branding: brandingView(),
    timeZone: "UTC",
    welcomeFallback: (productName) => `Welcome to ${productName}`,
    onPublish: fn<BrandingScreenProps["onPublish"]>(async () => {}),
    onUpload: fn(async () => MARK),
  },
} satisfies Meta<typeof BrandingScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

function preview(canvas: HTMLElement) {
  return within(canvas).getByRole("group", { name: "Preview" });
}

export const Identity: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByText("Published 20 Oct 2026, 09:30 by Ada Admin")
    ).toBeVisible();

    const name = canvas.getByRole("textbox", { name: "Company name" });

    await user.clear(name);
    await user.type(name, "Acme Health");

    await expect(
      within(preview(canvasElement)).getByText("Acme Health")
    ).toBeVisible();
    await expect(canvas.getByText("1 unpublished change")).toBeVisible();
    await expect(canvas.getByText("Draft")).toBeVisible();

    // The strip scrolls sideways only: the active underline must not add a vertical scrollbar.
    const list = canvas.getByRole("tablist");

    const scrollers = [list, list.parentElement ?? list].filter(
      (box) => getComputedStyle(box).overflowY !== "visible"
    );

    await expect(scrollers).toHaveLength(1);
    await expect(
      scrollers.filter((box) => box.scrollHeight > box.clientHeight)
    ).toHaveLength(0);
  },
};

export const ColorsPassing: Story = {
  play: async ({ canvas }) => {
    await user.click(canvas.getByRole("tab", { name: "Colors" }));

    const pills = within(canvas.getByRole("list", { name: "Contrast checks" }));

    await expect(pills.getAllByText("Pass")).toHaveLength(4);
    await expect(pills.getByText("Focus ring")).toBeVisible();
    await expect(pills.getByText("4.94:1")).toBeVisible();
    await expect(
      canvas.getByText(/one fixed light color, #60a5fa/)
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: /Fix/ })).toBeNull();
  },
};

export const ColorsFailing: Story = {
  // The preview shows the failing color on purpose: that is what the pills report and why Publish
  // is blocked. Everything outside the preview stays under the axe gate.
  parameters: {
    a11y: { test: "error", context: { exclude: ["[data-branding-preview]"] } },
  },
  play: async ({ canvas }) => {
    await user.click(canvas.getByRole("tab", { name: "Colors" }));

    const hex = canvas.getByRole("textbox", { name: "Primary color" });

    await user.clear(hex);
    await user.type(hex, "#93c5fd");

    const pills = within(canvas.getByRole("list", { name: "Contrast checks" }));

    await expect(pills.getAllByText("Fail")).toHaveLength(2);
    await expect(pills.getByText("1.80:1")).toBeVisible();
    await expect(pills.getByText("1.72:1")).toBeVisible();

    const publish = canvas.getByRole("button", { name: "Publish" });

    await expect(publish).toHaveAttribute("aria-disabled", "true");
    await expect(publish).toHaveAttribute(
      "title",
      "Fix the failing contrast checks first."
    );
  },
};

/** R-46: between 3:1 and 4.5:1 a text pair warns, the ring passes at 3:1, and Publish works. */
export const ColorsWarning: Story = {
  // The preview shows the warning color on purpose, as in ColorsFailing.
  parameters: {
    a11y: { test: "error", context: { exclude: ["[data-branding-preview]"] } },
  },
  play: async ({ args, canvas }) => {
    await user.click(canvas.getByRole("tab", { name: "Colors" }));

    const hex = canvas.getByRole("textbox", { name: "Primary color" });

    await user.clear(hex);
    await user.type(hex, "#ec4899");

    const pills = within(canvas.getByRole("list", { name: "Contrast checks" }));

    await expect(pills.getAllByRole("listitem")).toHaveLength(4);
    await expect(pills.getAllByText("Warning")).toHaveLength(3);
    await expect(pills.getAllByText("3.52:1")).toHaveLength(3);
    await expect(pills.getByText("Pass")).toBeVisible();
    await expect(pills.getByText("3.37:1")).toBeVisible();

    await user.click(canvas.getByRole("button", { name: "Publish" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Publish",
      })
    );

    await waitFor(() =>
      expect(args.onPublish).toHaveBeenCalledWith({ primaryColor: "#ec4899" })
    );
  },
};

export const InvalidHex: Story = {
  play: async ({ canvas }) => {
    await user.click(canvas.getByRole("tab", { name: "Colors" }));

    const hex = canvas.getByRole("textbox", { name: "Primary color" });

    await user.clear(hex);
    await user.type(hex, "blue");

    await expect(hex).toHaveAccessibleDescription(
      "Enter a six-digit hex color, for example #2563eb."
    );
    await expect(
      canvas.getByRole("button", { name: "Publish" })
    ).toHaveAttribute("aria-disabled", "true");
  },
};

export const SignIn: Story = {
  play: async ({ canvas, canvasElement }) => {
    await user.click(canvas.getByRole("tab", { name: "Sign-in" }));

    const acknowledge = canvas.getByRole("switch", {
      name: "People must acknowledge the notice",
    });

    await expect(acknowledge).toHaveAttribute("aria-disabled", "true");

    await user.type(
      canvas.getByRole("textbox", { name: "Welcome text" }),
      "Welcome to Northwind"
    );
    await expect(
      within(preview(canvasElement)).getByText("Welcome to Northwind")
    ).toBeVisible();

    await user.type(
      canvas.getByRole("textbox", { name: "System-use notice" }),
      "Authorized use only."
    );
    await expect(acknowledge).not.toHaveAttribute("aria-disabled", "true");
    await expect(
      within(preview(canvasElement)).getByText("Authorized use only.")
    ).toBeVisible();
  },
};

/**
 * R-46, DR-05: the fifth pair checks the sign-in text on the sign-in background. A stored color
 * below 3:1 blocks a Publish of any field, and one between 3:1 and 4.5:1 only warns.
 */
export const SignInContrast: Story = {
  args: { branding: brandingView({ loginBackgroundColor: "#22aaee" }) },
  play: async ({ args, canvas }) => {
    await user.click(canvas.getByRole("tab", { name: "Sign-in" }));

    const pill = () =>
      within(
        within(canvas.getByRole("list", { name: "Contrast checks" })).getByRole(
          "listitem"
        )
      );

    await expect(pill().getByText("Sign-in text")).toBeVisible();
    await expect(pill().getByText("2.89:1")).toBeVisible();
    await expect(pill().getByText("target 4.5:1")).toBeVisible();
    await expect(pill().getByText("Fail")).toBeVisible();

    await user.type(
      canvas.getByRole("textbox", { name: "Welcome text" }),
      "Hello"
    );

    const publish = canvas.getByRole("button", { name: "Publish" });

    await expect(publish).toHaveAttribute("aria-disabled", "true");
    await expect(publish).toHaveAttribute(
      "title",
      "Fix the failing contrast checks first."
    );

    const background = canvas.getByRole("textbox", {
      name: "Background color",
    });

    await user.clear(background);
    await user.type(background, "#55bbee");

    await expect(pill().getByText("3.50:1")).toBeVisible();
    await expect(pill().getByText("Warning")).toBeVisible();
    await expect(publish).not.toHaveAttribute("aria-disabled", "true");

    await user.click(publish);
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Publish",
      })
    );

    await waitFor(() =>
      expect(args.onPublish).toHaveBeenCalledWith({
        loginBackgroundColor: "#55bbee",
        loginWelcomeText: "Hello",
      })
    );
  },
};

export const UploadAccepted: Story = {
  play: async ({ args, canvas, canvasElement }) => {
    const file = new File(["png"], "northwind-mark.png", { type: "image/png" });

    await user.upload(
      canvas.getByLabelText("Upload a file for Square mark"),
      file
    );

    await waitFor(() =>
      expect(args.onUpload).toHaveBeenCalledWith("logoMark", file)
    );

    const slot = within(canvas.getByRole("group", { name: "Square mark" }));

    await expect(await slot.findByText("northwind-mark.png")).toBeVisible();
    await expect(slot.getByText("Skipped")).toBeVisible();
    await expect(slot.getByRole("button", { name: "Replace" })).toBeVisible();
    await expect(slot.getByRole("button", { name: "Remove" })).toBeVisible();
    await expect(preview(canvasElement).querySelector("img")).toHaveAttribute(
      "src",
      MARK.url
    );
    await expect(canvas.getByText("1 unpublished change")).toBeVisible();
  },
};

export const UploadRefused: Story = {
  play: async ({ args, canvas }) => {
    const input = canvas.getByLabelText(
      "Upload a file for Logo for light backgrounds"
    );

    const slot = within(
      canvas.getByRole("group", { name: "Logo for light backgrounds" })
    );

    await user.upload(
      input,
      new File([new Uint8Array(1_048_577)], "big.png", { type: "image/png" })
    );
    await expect(slot.getByText("This file is over 1 MB.")).toBeVisible();

    await user.upload(
      input,
      new File(["%PDF"], "report.pdf", { type: "application/pdf" })
    );
    // DR-02, R-69: the refusal is announced, not only shown.
    await expect(slot.getByRole("alert")).toHaveTextContent(
      "Use a PNG, SVG, WebP or ICO file."
    );
    await expect(args.onUpload).not.toHaveBeenCalled();
  },
};

/**
 * DR-20 S3-07: a browser can report an empty type. The extension names the type, and the upload
 * sends it; a file with another extension and no type is still refused.
 */
export const UploadWithNoDeclaredType: Story = {
  play: async ({ args, canvas }) => {
    const input = canvas.getByLabelText("Upload a file for Square mark");

    await user.upload(input, new File(["png"], "logo.png", { type: "" }));

    await waitFor(() =>
      expect(args.onUpload).toHaveBeenCalledWith(
        "logoMark",
        expect.objectContaining({ name: "logo.png", type: "image/png" })
      )
    );

    await user.upload(input, new File(["notes"], "notes.txt", { type: "" }));

    await expect(
      within(canvas.getByRole("group", { name: "Square mark" })).getByRole(
        "alert"
      )
    ).toHaveTextContent("Use a PNG, SVG, WebP or ICO file.");
    await expect(args.onUpload).toHaveBeenCalledOnce();
  },
};

/** Presses Tab until the target holds focus, so the ring shows as it does for a keyboard user. */
async function tabTo(target: Element, stops = 60): Promise<void> {
  if (document.activeElement === target || stops === 0) return;

  await user.tab();

  return tabTo(target, stops - 1);
}

/** R-8: the ring is --ring, blue-600 in light and the fixed --brand-on-dark (blue-400) in dark. */
function ringColor(theme: ThemeName): string {
  return theme === "dark" ? "rgb(96, 165, 250)" : "rgb(37, 99, 235)";
}

export const KeyboardFocusRings: Story = {
  play: async ({ canvas, globals }) => {
    const ring = ringColor(globals["theme"]);

    const upload = within(
      canvas.getByRole("group", { name: "Square mark" })
    ).getByRole("button", { name: /^Drop an image or browse/ });

    await tabTo(upload);
    await expect(upload).toHaveFocus();
    await expect(getComputedStyle(upload).boxShadow).toContain(ring);

    await user.click(canvas.getByRole("tab", { name: "Colors" }));

    const primary = canvas.getByLabelText("Pick the primary color");

    await tabTo(primary);
    await expect(getComputedStyle(primary).boxShadow).toContain(ring);

    await user.click(canvas.getByRole("tab", { name: "Sign-in" }));

    const background = canvas.getByLabelText("Pick the background color");

    await tabTo(background);
    await expect(getComputedStyle(background).boxShadow).toContain(ring);

    const notice = canvas.getByRole("textbox", { name: "System-use notice" });

    await tabTo(notice);
    await expect(getComputedStyle(notice).boxShadow).toContain(ring);
  },
};

export const KeyboardFocusRingsOnDark: Story = {
  ...KeyboardFocusRings,
  globals: { theme: "dark" },
};

export const Uploading: Story = {
  args: { onUpload: fn(() => new Promise<never>(() => {})) },
  play: async ({ canvas }) => {
    await user.upload(
      canvas.getByLabelText("Upload a file for Favicon"),
      new File(["ico"], "favicon.ico", { type: "image/x-icon" })
    );

    await expect(
      within(canvas.getByRole("group", { name: "Favicon" })).getByText(
        "Uploading favicon.ico"
      )
    ).toBeVisible();
  },
};

export const ScanStates: Story = {
  args: {
    branding: brandingView(
      {
        logoMarkFileId: MARK.fileId,
        faviconFileId: "0b8f2a6e-8c55-4d84-a1f6-2a7e3e0f9d11",
      },
      {
        logoMark: imageView({ scanStatus: "pending", url: null }),
        favicon: imageView({
          fileId: "0b8f2a6e-8c55-4d84-a1f6-2a7e3e0f9d11",
          fileName: "favicon.ico",
          scanStatus: "infected",
          url: null,
        }),
      }
    ),
  },
  play: async ({ canvas }) => {
    const markGroup = canvas.getByRole("group", { name: "Square mark" });
    const mark = within(markGroup);

    await expect(mark.getByText("Scanning")).toBeVisible();
    await expect(
      mark.getByText("Not shown to members until the scan finishes.")
    ).toBeVisible();
    await expect(markGroup.querySelector("img")).toBeNull();

    const faviconGroup = canvas.getByRole("group", { name: "Favicon" });

    await expect(within(faviconGroup).getByRole("alert")).toHaveTextContent(
      "This file was refused by the malware scan."
    );
    await expect(faviconGroup.querySelector("img")).toBeNull();
  },
};

export const BrokenPreviewLink: Story = {
  args: {
    branding: brandingView(
      { logoMarkFileId: MARK.fileId },
      { logoMark: imageView({ url: "/branding-preview-expired.png" }) }
    ),
  },
  play: async ({ canvas, canvasElement }) => {
    const slot = canvas.getByRole("group", { name: "Square mark" });

    // The slot drops a thumbnail that fails to load instead of showing a broken image.
    await waitFor(() => expect(slot.querySelector("img")).toBeNull());
    await expect(within(slot).getByText("northwind-mark.png")).toBeVisible();
    // The preview mark falls back to the Ops Center icon, as the shell does (DR-19).
    await waitFor(() =>
      expect(
        [...preview(canvasElement).querySelectorAll("img")].map((image) =>
          image.getAttribute("src")
        )
      ).toEqual([DEFAULT_MARK_URL])
    );
  },
};

export const PublishConfirm: Story = {
  play: async ({ args, canvas }) => {
    const name = canvas.getByRole("textbox", { name: "Company name" });

    await user.clear(name);
    await user.type(name, "Acme");
    await user.click(canvas.getByRole("tab", { name: "Colors" }));
    await user.click(canvas.getByRole("radio", { name: "Dark" }));
    await user.click(canvas.getByRole("button", { name: "Publish" }));

    const dialog = within(
      await screen.findByRole("dialog", { name: "Publish 2 changes?" })
    );

    await waitFor(() =>
      expect(
        dialog.getByText(
          /Identity: Company name\. Colors and theme: Default theme\./
        )
      ).toBeVisible()
    );
    await expect(dialog.getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.click(dialog.getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(args.onPublish).toHaveBeenCalledOnce());
    await expect(args.onPublish).toHaveBeenCalledWith({
      companyName: "Acme",
      defaultTheme: "dark",
    });
    await waitFor(() =>
      expect(canvas.queryByText(/unpublished change/)).toBeNull()
    );
  },
};

export const PublishRefused: Story = {
  args: {
    onPublish: fn<BrandingScreenProps["onPublish"]>(async () => {
      throw {
        message:
          "Some branding values are not valid. Fix the marked fields and publish again.",
        // A malformed issue is dropped, and the refusal's own message still shows.
        issues: [{ path: 7, message: 8 }],
      };
    }),
  },
  play: async ({ canvas }) => {
    await user.type(
      canvas.getByRole("textbox", { name: "Product name" }),
      " Plus"
    );
    await user.click(canvas.getByRole("button", { name: "Publish" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Publish",
      })
    );

    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Some branding values are not valid."
    );
    await expect(canvas.getByText("1 unpublished change")).toBeVisible();
  },
};

export const PublishIssueOnImage: Story = {
  args: {
    // A dead id names the slot but has no image view: real data drops it from `images`.
    branding: brandingView({ logoLightFileId: MARK.fileId }),
    onPublish: fn<BrandingScreenProps["onPublish"]>(async () => {
      throw {
        message:
          "Some branding values are not valid. Fix the marked fields and publish again.",
        issues: [
          {
            path: "logoLightFileId",
            message:
              "The logo for light backgrounds is missing. Remove it or upload it again.",
          },
        ],
      };
    }),
  },
  play: async ({ args, canvas }) => {
    const issue =
      "The logo for light backgrounds is missing. Remove it or upload it again.";

    const slot = () =>
      within(canvas.getByRole("group", { name: "Logo for light backgrounds" }));

    async function publish() {
      await user.click(canvas.getByRole("button", { name: "Publish" }));
      await user.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: "Publish",
        })
      );
    }

    await user.type(
      canvas.getByRole("textbox", { name: "Company name" }),
      " Ltd"
    );
    await publish();

    // The refused Publish names the logo field, and the message sits under its slot.
    await expect(await slot().findByText(issue)).toBeVisible();

    // A dead id has no image, so there is no Replace; the drop zone stays usable and Remove
    // is offered, because the message tells the person to remove it.
    await expect(slot().queryByRole("button", { name: "Replace" })).toBeNull();

    // Removing the dead id clears the issue it carried.
    await user.click(slot().getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(slot().queryByText(issue)).toBeNull());
    await expect(slot().queryByRole("button", { name: "Remove" })).toBeNull();

    // The same refusal names it again, and a new upload replaces the dead id.
    await publish();
    await expect(await slot().findByText(issue)).toBeVisible();

    await user.upload(
      canvas.getByLabelText("Upload a file for Logo for light backgrounds"),
      new File(["png"], "new-logo.png", { type: "image/png" })
    );
    await waitFor(() => expect(slot().queryByText(issue)).toBeNull());
    await waitFor(() =>
      expect(args.onUpload).toHaveBeenCalledWith("logoLight", expect.any(File))
    );
  },
};

export const DiscardConfirm: Story = {
  play: async ({ canvas }) => {
    await user.type(
      canvas.getByRole("textbox", { name: "Product name" }),
      " Plus"
    );
    await user.click(canvas.getByRole("button", { name: "Discard" }));

    const dialog = within(
      await screen.findByRole("dialog", { name: "Discard 1 change?" })
    );

    await waitFor(() =>
      expect(dialog.getByText(/The changes are lost\./)).toBeVisible()
    );
    await user.click(dialog.getByRole("button", { name: "Discard" }));

    await waitFor(() =>
      expect(canvas.getByRole("textbox", { name: "Product name" })).toHaveValue(
        "Northwind Ops"
      )
    );
    await expect(canvas.queryByText(/unpublished change/)).toBeNull();
  },
};

/** Fires the browser's unload event and answers whether a listener asked to stay. */
function unload(): boolean {
  const event = new Event("beforeunload", { cancelable: true });

  window.dispatchEvent(event);

  return event.defaultPrevented;
}

export const UnloadGuard: Story = {
  play: async ({ canvas }) => {
    await expect(unload()).toBe(false);
    await user.type(
      canvas.getByRole("textbox", { name: "Product name" }),
      " Plus"
    );
    await expect(unload()).toBe(true);

    await user.click(canvas.getByRole("button", { name: "Discard" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Discard",
      })
    );
    await waitFor(() => expect(unload()).toBe(false));
  },
};

export const UnloadGuardAfterPublish: Story = {
  play: async ({ args, canvas }) => {
    await expect(unload()).toBe(false);
    await user.type(
      canvas.getByRole("textbox", { name: "Product name" }),
      " Plus"
    );
    await expect(unload()).toBe(true);

    await user.click(canvas.getByRole("button", { name: "Publish" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Publish",
      })
    );

    await waitFor(() => expect(args.onPublish).toHaveBeenCalledOnce());
    await waitFor(() => expect(unload()).toBe(false));
  },
};

export const Phone: Story = {
  globals: phone,
  play: async ({ canvas, canvasElement }) => {
    const bar = within(canvas.getByRole("region", { name: "Publish actions" }));

    await expect(bar.getByRole("button", { name: "Publish" })).toBeVisible();
    await expect(canvas.queryByRole("group", { name: "Preview" })).toBeNull();

    await user.click(canvas.getByRole("tab", { name: "Sign-in" }));
    await expect(canvas.getByRole("tab", { name: "Sign-in" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    await user.click(canvas.getByRole("button", { name: "Show preview" }));
    await expect(preview(canvasElement)).toBeVisible();
  },
};

export const PreviewDark: Story = {
  play: async ({ canvas, canvasElement }) => {
    await user.click(canvas.getByRole("button", { name: "Dark" }));

    await expect(canvas.getByRole("button", { name: "Dark" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(preview(canvasElement)).toHaveAttribute("data-theme", "dark");
  },
};

/**
 * The host refetches after a Publish, as the app's TanStack Query does; meanwhile another
 * administrator renamed the product. The page shows the server's values, not the stale ones.
 */
export const PublishShowsTheRefetch: Story = {
  render: function Render(args) {
    const [branding, setBranding] = useState(args.branding);

    return (
      <BrandingScreen
        {...args}
        branding={branding}
        onPublish={async (changes) => {
          await args.onPublish(changes);
          setBranding(
            brandingView({
              companyName: "Acme",
              productName: "Renamed elsewhere",
            })
          );
          await new Promise((resolve) => setTimeout(resolve, 50));
        }}
      />
    );
  },
  play: async ({ canvas }) => {
    const name = canvas.getByRole("textbox", { name: "Company name" });

    await user.clear(name);
    await user.type(name, "Acme");
    await user.click(canvas.getByRole("button", { name: "Publish" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Publish",
      })
    );

    await waitFor(() =>
      expect(canvas.getByRole("textbox", { name: "Product name" })).toHaveValue(
        "Renamed elsewhere"
      )
    );
    await expect(canvas.queryByText(/unpublished change/)).toBeNull();
  },
};

/**
 * A refetch while the draft holds edits brings fresh preview links (they expire after five
 * minutes); the draft stays, and the mark loads through the new link.
 */
export const RefreshedLinkWhileEditing: Story = {
  args: {
    branding: brandingView(
      { logoMarkFileId: MARK.fileId },
      { logoMark: imageView({ url: "/branding-preview-expired.png" }) }
    ),
  },
  render: function Render(args) {
    const [branding, setBranding] = useState(args.branding);

    return (
      <>
        <button
          type="button"
          onClick={() =>
            setBranding(
              brandingView(
                { logoMarkFileId: MARK.fileId },
                { logoMark: imageView({ url: PIXEL }) }
              )
            )
          }
        >
          Refetch
        </button>
        <BrandingScreen {...args} branding={branding} />
      </>
    );
  },
  play: async ({ canvas, canvasElement }) => {
    await user.type(
      canvas.getByRole("textbox", { name: "Product name" }),
      " Plus"
    );
    await user.click(canvas.getByRole("button", { name: "Refetch" }));

    await waitFor(() =>
      expect(preview(canvasElement).querySelector("img")).toHaveAttribute(
        "src",
        PIXEL
      )
    );
    await expect(
      canvas.getByRole("textbox", { name: "Product name" })
    ).toHaveValue("Northwind Ops Plus");
  },
};

/** An upload that finishes after a later file was refused leaves that refusal in place. */
export const LateUploadKeepsRefusal: Story = {
  args: {
    onUpload: fn(
      () =>
        new Promise<typeof MARK>((resolve) =>
          setTimeout(() => resolve(MARK), 300)
        )
    ),
  },
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText("Upload a file for Square mark");
    const slot = within(canvas.getByRole("group", { name: "Square mark" }));

    await user.upload(
      input,
      new File(["png"], "northwind-mark.png", { type: "image/png" })
    );
    await user.upload(
      input,
      new File([new Uint8Array(1_048_577)], "big.png", { type: "image/png" })
    );
    await expect(slot.getByText("This file is over 1 MB.")).toBeVisible();

    await expect(await slot.findByText("northwind-mark.png")).toBeVisible();
    await expect(slot.getByText("This file is over 1 MB.")).toBeVisible();
  },
};

/** Discard drops an upload that is still running: it never lands in the dropped draft. */
export const DiscardDropsPendingUpload: Story = {
  args: {
    onUpload: fn(
      () =>
        new Promise<typeof MARK>((resolve) =>
          setTimeout(() => resolve(MARK), 300)
        )
    ),
  },
  play: async ({ args, canvas }) => {
    await user.type(
      canvas.getByRole("textbox", { name: "Product name" }),
      " Plus"
    );
    await user.upload(
      canvas.getByLabelText("Upload a file for Square mark"),
      new File(["png"], "northwind-mark.png", { type: "image/png" })
    );
    await user.click(canvas.getByRole("button", { name: "Discard" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Discard",
      })
    );

    await waitFor(() => expect(args.onUpload).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 500));

    await expect(canvas.queryByText(/unpublished change/)).toBeNull();
    await expect(
      within(canvas.getByRole("group", { name: "Square mark" })).queryByText(
        "northwind-mark.png"
      )
    ).toBeNull();
  },
};

export const Loading: Story = {
  args: { branding: undefined, loading: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Loading branding"
    );
  },
};

export const Dark: Story = {
  globals: { theme: "dark" },
};
