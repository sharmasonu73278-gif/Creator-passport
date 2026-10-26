import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { finishConnect } from "@/lib/instagram-sync";
import { siteUrl } from "@/lib/instagram";

// Step 2: Instagram sends the user back here with a one-time code.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");
  const cookieState = request.cookies.get("ig_state")?.value;

  const back = (key: "error" | "message", msg: string) => {
    const res = NextResponse.redirect(`${siteUrl()}/dashboard?${key}=${encodeURIComponent(msg)}`);
    res.cookies.delete("ig_state");
    return res;
  };

  if (denied) return back("error", "Instagram connection was cancelled.");
  if (!code || !state || !cookieState || state !== cookieState) {
    return back("error", "The connection link expired or was invalid. Please try again.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${siteUrl()}/login?next=/dashboard`);

  try {
    const result = await finishConnect(user.id, code);
    return back("message", `Connected @${result.username}. Found ${result.reels} reels.`);
  } catch (e) {
    return back("error", e instanceof Error ? e.message : "Could not connect Instagram.");
  }
}
