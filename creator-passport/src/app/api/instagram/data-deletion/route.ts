import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeInstagramData } from "@/lib/instagram-sync";
import { parseSignedRequest, siteUrl } from "@/lib/instagram";

// Meta's "Data deletion request URL". Deletes the Instagram data we hold for that person and
// returns a confirmation code with a status page, as Meta requires.
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

  const code = randomBytes(8).toString("hex");
  await admin.from("deletion_requests").insert({ code, ig_user_id: payload.user_id, status: "completed" });

  return NextResponse.json({
    url: `${siteUrl()}/data-deletion?code=${code}`,
    confirmation_code: code,
  });
}
