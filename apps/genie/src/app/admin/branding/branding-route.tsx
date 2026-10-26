"use client";

import type { BrandingDraft } from "@genie/core";
import { BrandingScreen } from "@genie/core/features/branding";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { useAdminWrite } from "../../../rpc/admin-write.ts";
import { refusalOf, rpc } from "../../../rpc/client.ts";

/**
 * The browser half of the Branding route. The server refused a caller without
 * `core:branding:manage` before this mounts, and every procedure re-checks it. The draft lives in
 * the screen; this holds the server state.
 */
export function BrandingRoute(props: { readonly timeZone: string }) {
  const t = useTranslations("signIn");

  const branding = useQuery({
    queryKey: ["branding"],
    queryFn: () => rpc.branding.read(),
  });

  const publish = useAdminWrite({
    write: (draft: Partial<BrandingDraft>) => rpc.branding.publish({ draft }),
    invalidate: [["branding"]],
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
        await publish.mutateAsync(draft);
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
