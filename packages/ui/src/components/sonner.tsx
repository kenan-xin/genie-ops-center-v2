"use client";

import { useSyncExternalStore } from "react";
import { Toaster as Sonner } from "sonner";

const WIDE = "(min-width: 768px)";

const subscribe = (notify: () => void) => {
  const query = matchMedia(WIDE);

  query.addEventListener("change", notify);

  return () => query.removeEventListener("change", notify);
};

// Sonner's own phone rule starts at 600 px, so the switch at 768 px (R-24) is read here.
const Toaster = () => {
  const wide = useSyncExternalStore(
    subscribe,
    () => matchMedia(WIDE).matches,
    () => false
  );

  return (
    <Sonner
      position={wide ? "bottom-right" : "bottom-center"}
      visibleToasts={3}
      duration={4000}
      containerAriaLabel="Notifications"
    />
  );
};

export { Toaster };
