"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * The offline bar (R-35). The live region is always mounted, so the message is announced when it
 * appears. The server render is online; the browser's state applies after mount.
 */
export function OfflineBar(props: { readonly message: string }) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);

    setOffline(!navigator.onLine);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return (
    <div role="status" aria-live="polite">
      {offline ? (
        <div className="flex min-h-10 w-full items-center justify-center gap-2 bg-destructive px-4 py-2 text-center text-sm font-medium text-white">
          <WifiOff aria-hidden strokeWidth={1.75} className="size-4 shrink-0" />
          {props.message}
        </div>
      ) : null}
    </div>
  );
}
