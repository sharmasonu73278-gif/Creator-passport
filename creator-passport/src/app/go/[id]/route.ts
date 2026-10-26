import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { actorHash } from "@/lib/actor";
import { normalizeUrl } from "@/lib/utils";

// Records a click on a resource, then sends the visitor to the real link.
// Works for signed-out visitors, because public resources never require an account.
// Clicks are written by the server only, one per person per resource per hour, so counts can't be inflated
// by refreshing or by calling the database directly.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: resource } = await supabase
    .from("resources")
    .select("id,url,collection_id")
    .eq("id", id)
    .maybeSingle();

  const target = normalizeUrl(resource?.url);
  if (!resource || !target) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const { data: collection } = await supabase
    .from("collections")
    .select("creator_id,is_published,moderation_status")
    .eq("id", resource.collection_id)
    .maybeSingle();

  if (collection?.is_published && collection.moderation_status === "approved") {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Don't count creators clicking their own links while testing.
    if (user?.id !== collection.creator_id) {
      try {
        const admin = createAdminClient();
        const hash = await actorHash(user?.id);
        const since = new Date(Date.now() - 3600 * 1000).toISOString();
        const { count } = await admin
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("type", "resource_click")
          .eq("resource_id", resource.id)
          .eq("actor_hash", hash)
          .gt("created_at", since);
        if (!count) {
          await admin.from("events").insert({
            type: "resource_click",
            collection_id: resource.collection_id,
            resource_id: resource.id,
            actor_hash: hash,
          });
        }
      } catch {
        // Never block the visitor because tracking failed.
      }
    }
  }

  return NextResponse.redirect(target, 302);
}
