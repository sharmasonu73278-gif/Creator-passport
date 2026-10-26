import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeInstagramData } from "@/lib/instagram-sync";
import { parseSignedRequest } from "@/lib/instagram";

// Meta calls this when someone removes the app from their Instagram settings.
// Register it in the Meta app dashboard as the "Deauthorize callback URL".
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const signed = form?.get("signed_request");
  if (typeof signed !== "string") return NextResponse.json({ error: "bad request" }, { status: 400 });

  const payload = parseSignedRequest(signed);
  if (!payload?.user_id) return NextResponse.json({ error: "invalid signature" }, { status: 400 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("instagram_user_id", payload.user_id)
    .maybeSingle();
  if (profile) await removeInstagramData(profile.id);

  return NextResponse.json({ ok: true });
}
