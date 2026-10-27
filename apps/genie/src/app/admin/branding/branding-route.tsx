"use client";

import type { BrandingDraft } from "@genie/core";
import { BrandingScreen } from "@genie/core/features/branding";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation.js";

import { useAdminWrite } from "../../../rpc/admin-write.ts";
import { refusalOf, rpc } from "../../../rpc/client.ts";

// DEC-46: the root layout reads branding through a reader that can serve the old row for 10 s
// and that no save clears, so a refresh this long after Publish reads the new row.
const READER_WINDOW_MS = 11_000;

/**
 * The browser half of the Branding route. The server refused a caller without
 * `core:branding:manage` before this mounts, and every procedure re-checks it. The draft lives in
 * the screen; this holds the server state.
 */
export function BrandingRoute(props: { readonly timeZone: string }) {
  const t = useTranslations("signIn");
  const router = useRouter();

  const branding = useQuery({
    queryKey: ["branding"],
    queryFn: () => rpc.branding.read(),
  });

  const publish = useAdminWrite({
    write: (draft: Partial<BrandingDraft>) => rpc.branding.publish({ draft }),
    invalidate: [["branding"]],
    // The root layout renders the branding head, and no client navigation renders it again (NAV-1).
    refresh: true,
    saved: (result) => (result.changed ? "Published" : undefined),
    // The screen places the refusal's issues under their fields (DR-20 S3-07).
    refused: () => undefined,
  });

  // An upload stores a file and saves nothing: Publish names its slot later (R-44).
  const upload = useMutation({
    mutationFn: (file: File) => rpc.branding.upload({ file }),
  });

  return (
    <BrandingScreen
      branding={branding.data}
      loading={branding.isPending}
      // A failed background refetch keeps the values already read; only a first read failure shows.
      error={
        branding.isError && branding.data === undefined
          ? "The branding could not be read."
          : undefined
      }
      timeZone={props.timeZone}
      welcomeFallback={(productName) => t("welcomeFallback", { productName })}
      onPublish={async (draft) => {
        const result = await publish.mutateAsync(draft);

        // Not cleared on unmount: a person who leaves the page within the window still gets the new head.
        if (result.changed)
          window.setTimeout(() => router.refresh(), READER_WINDOW_MS);
      }}
      // The slot stays in the screen; the server stores a file and Publish names its slot (R-44).
      onUpload={async (_slot, file) => {
        try {
          return await upload.mutateAsync(file);
        } catch (cause) {
          // The screen shows the first issue, which names the size or the type.
          throw refusalOf(cause);
        }
      }}
    />
  );
}
