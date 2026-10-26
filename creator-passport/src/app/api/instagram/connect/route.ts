import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthUrl, instagramConfigured, siteUrl } from "@/lib/instagram";

// Step 1 of connecting Instagram: send the signed-in user to Instagram's approval screen.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${siteUrl()}/login?next=/dashboard`);

  if (!instagramConfigured()) {
    return NextResponse.redirect(
      `${siteUrl()}/dashboard?error=${encodeURIComponent("Instagram connection is not set up on this server yet.")}`
    );
  }

  // A random one-time value ties the return trip to this browser (protects against forged callbacks).
  const state = randomBytes(24).toString("hex");
  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set("ig_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
