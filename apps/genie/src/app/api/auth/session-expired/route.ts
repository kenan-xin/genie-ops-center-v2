import { sessionCookieName } from "@genie/core";
import { NextResponse } from "next/server.js";

import { requireContext } from "../../../../context.ts";

export const dynamic = "force-dynamic";

/** Clears a cookie whose enforced idle read already deleted its session, then shows R-17a. */
export async function GET(): Promise<Response> {
  const publicUrl = requireContext().tenant.env.publicUrl;

  const response = NextResponse.redirect(
    new URL("/sign-in?error=session_expired", publicUrl),
    303
  );

  response.cookies.set(sessionCookieName(publicUrl), "", {
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax",
    secure: publicUrl.startsWith("https://"),
    path: "/",
  });
  response.headers.set("cache-control", "no-store");

  return response;
}
