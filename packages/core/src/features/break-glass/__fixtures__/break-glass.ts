import type { AccountSession } from "../../account/types.ts";
import type { BreakGlassEnrollment } from "../break-glass-sign-in.tsx";

/** The fixed enrollment the stories render, so the QR seed and manual key are stable. */
export const FIXTURE_ENROLLMENT: BreakGlassEnrollment = {
  otpauthUri:
    "otpauth://totp/Genie%20Ops%20Center:breakglass@company.example?secret=JBSWY3DPEHPK3PXP&issuer=Genie%20Ops%20Center",
  manualKey: "JBSW Y3DP EHPK 3PXP",
  issuer: "Genie Ops Center",
};

/** The break-glass account's sessions: one current device and one other. */
export const FIXTURE_BREAK_GLASS_SESSIONS: readonly AccountSession[] = [
  {
    id: "s-current",
    device: "MacBook Pro",
    browser: "Chrome 141",
    ipAddress: "203.0.113.7",
    signedInAt: "2026-09-29T09:00:00.000Z",
    lastActiveAt: "2026-09-29T09:30:00.000Z",
    isCurrent: true,
  },
  {
    id: "s-phone",
    device: "Pixel 7",
    browser: "Chrome 141",
    ipAddress: "203.0.113.9",
    signedInAt: "2026-09-28T18:00:00.000Z",
    lastActiveAt: "2026-09-29T08:00:00.000Z",
    isCurrent: false,
  },
];
