import { useRef, useState } from "react";
import { z } from "zod";

// The host's rejection carries the copy to show as its `message`.
const Refusal = z.object({ message: z.string().min(1) });

// A rejection that carries no copy, which a host that follows the contract never sends.
const NOT_SAVED = "That change could not be saved. Try again.";

/**
 * The submit of an admin form dialog (tokens.md U-1). The dialog waits for the host's promise and
 * closes only when it resolves. A refusal rejects with the copy to show as its `message`; the
 * dialog stays open with the typed values and shows that copy in its action bar. `clear` runs on
 * Cancel, so the next open starts without a stale refusal, and an answer that arrives after Cancel
 * is dropped.
 */
export function useDialogSubmit() {
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Each submit and each Cancel starts a new generation; only the current one may report.
  const generation = useRef(0);

  const submit = async (
    work: () => Promise<void> | void,
    onSaved: () => void
  ) => {
    const current = ++generation.current;

    setFailure(null);
    setSubmitting(true);

    try {
      await work();

      if (current === generation.current) onSaved();
    } catch (cause) {
      if (current === generation.current)
        setFailure(Refusal.safeParse(cause).data?.message ?? NOT_SAVED);
    } finally {
      if (current === generation.current) setSubmitting(false);
    }
  };

  const clear = () => {
    generation.current += 1;
    setFailure(null);
    setSubmitting(false);
  };

  return { failure, submitting, submit, clear };
}
