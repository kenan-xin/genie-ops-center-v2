"use client";

import type { BrandingDraft, BrandingImageSlot } from "@genie/core";
import { BrandingScreen } from "@genie/core/features/branding";
import { toast } from "@genie/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { refusalOf, rpc } from "../../../rpc/client.ts";

/**
 * The browser half of the Branding route. The server refused a caller without
 * `core:branding:manage` before this mounts, and every procedure re-checks it. The draft lives in
 * the screen; this holds the server state.
 */
export function BrandingRoute(props: { readonly timeZone: string }) {
  const queryClient = useQueryClient();

  const branding = useQuery({
    queryKey: ["branding"],
    queryFn: () => rpc.branding.read(),
  });

  const publish = useMutation({
    mutationFn: (draft: Partial<BrandingDraft>) =>
      rpc.branding.publish({ draft }),
  });

  const upload = useMutation({
    mutationFn: (input: {
      readonly slot: BrandingImageSlot;
      readonly file: File;
    }) => rpc.branding.upload(input),
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
      onPublish={async (draft) => {
        try {
          const result = await publish.mutateAsync(draft);

          if (result.changed) toast({ tone: "success", title: "Published" });
        } catch (cause) {
          // The screen places the refusal's issues under their fields (DR-20 S3-07).
          throw refusalOf(cause);
        }

        await queryClient.invalidateQueries({ queryKey: ["branding"] });
      }}
      onUpload={async (slot, file) => {
        try {
          return await upload.mutateAsync({ slot, file });
        } catch (cause) {
          // The screen shows the first issue, which names the size or the type.
          throw refusalOf(cause);
        }
      }}
    />
  );
}
