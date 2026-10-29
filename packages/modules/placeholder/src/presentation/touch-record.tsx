"use client";

import { useModuleClient } from "@genie/core/rpc/client";
import { Button } from "@genie/ui";
import { useMutation } from "@tanstack/react-query";

import { placeholderContract } from "../contract.ts";

/** Touches one record through the module's own `touch` procedure, from the browser (Spec 7 R-2). */
export function TouchRecord(props: { readonly id: string }) {
  const placeholder = useModuleClient(placeholderContract);

  const touch = useMutation({
    mutationFn: () => placeholder.touch({ id: props.id }),
  });

  return (
    <div>
      <Button disabled={touch.isPending} onClick={() => touch.mutate()}>
        Touch record
      </Button>
      {touch.isSuccess && <p role="status">Touch queued.</p>}
      {touch.isError && <p role="alert">The record could not be touched.</p>}
    </div>
  );
}
