import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/crypto";
import { refreshToken } from "@/lib/instagram";

// Instagram tokens last 60 days. This job (run daily by Vercel Cron, see vercel.json) renews any
// token that expires within 25 days so creators stay connected. Protected by CRON_SECRET.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const soon = new Date(Date.now() + 25 * 24 * 3600 * 1000).toISOString();
  const { data: rows } = await admin
    .from("instagram_connections")
    .select("user_id, token_enc, token_expires_at, created_at")
    .lt("token_expires_at", soon)
    .gt("token_expires_at", new Date().toISOString());

  let refreshed = 0;
  let failed = 0;
  for (const row of rows ?? []) {
    try {
      const next = await refreshToken(decrypt(row.token_enc));
      await admin
        .from("instagram_connections")
        .update({
          token_enc: encrypt(next.accessToken),
          token_expires_at: new Date(Date.now() + next.expiresIn * 1000).toISOString(),
        })
        .eq("user_id", row.user_id);
      refreshed++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ refreshed, failed });
}
