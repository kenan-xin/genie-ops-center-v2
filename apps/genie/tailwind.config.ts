import { tailwindPreset } from "@genie/config/tailwind";
import type { Config } from "tailwindcss";

/**
 * The first real consumer of the shared preset (genie-ops-center-v2-3yv).
 *
 * Tailwind 4 is CSS-first, and the shared preset is a JavaScript config object,
 * so the stylesheet reaches it through `@config`. That is what makes the
 * consumption observable: the preset's content glob appears in the compiler's
 * source list only while the preset is actually read.
 *
 * Declare no `content` here. The preset supplies it, and repeating the same
 * glob would make the proof vacuous: the compiler would list the pattern twice,
 * once from each side, so removing the preset would leave the assertion passing.
 * That is exactly the false-confidence failure the bead was filed against.
 */
export default {
  content: ["../../packages/core/src/features/**/*.{ts,tsx}"],
  presets: [tailwindPreset],
} satisfies Config;
