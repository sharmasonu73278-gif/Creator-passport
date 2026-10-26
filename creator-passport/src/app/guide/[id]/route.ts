import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Hands out a short-lived download link for a resource's PDF guide.
// The guide is only served when the resource itself is visible to this person AND the guide was approved
// (the creator and admins can always open it).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Row level security means this only returns resources this person is allowed to see.
  const { data: resource } = await supabase
    .from("resources")
    .select("guide_path,guide_name,guide_approved,collection_id")
    .eq("id", id)
    .maybeSingle();

  const notFound = () => NextResponse.redirect(new URL("/", request.url));
  if (!resource?.guide_path) return notFound();

  let allowed = Boolean(resource.guide_approved);
  if (!allowed && user) {
    const [{ data: me }, { data: col }] = await Promise.all([
      supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle(),
      supabase.from("collections").select("creator_id").eq("id", resource.collection_id).maybeSingle(),
    ]);
    allowed = Boolean(me?.is_admin) || col?.creator_id === user.id;
  }
  if (!allowed) return notFound();

  const admin = createAdminClient();
  const { data: signed } = await admin.storage
    .from("guides")
    .createSignedUrl(resource.guide_path, 120, { download: resource.guide_name ?? "guide.pdf" });
  if (!signed?.signedUrl) return notFound();

  return NextResponse.redirect(signed.signedUrl, 302);
}
