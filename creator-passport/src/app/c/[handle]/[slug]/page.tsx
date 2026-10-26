import Link from "next/link";
import { notFound } from "next/navigation";
import Flash from "@/components/Flash";
import ResourceItem from "@/components/ResourceItem";
import { saveCollectionResources } from "@/app/actions";
import { actorHash } from "@/lib/actor";
import { first, type SearchParams } from "@/lib/params";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Collection, Profile, Resource } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = Promise<{ handle: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const { handle, slug } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase.from("profiles").select("id").eq("handle", handle.toLowerCase()).maybeSingle();
  if (!p) return { title: "Collection" };
  const { data: c } = await supabase
    .from("collections")
    .select("title,description")
    .eq("creator_id", p.id)
    .eq("slug", slug)
    .eq("is_published", true)
    .eq("moderation_status", "approved")
    .maybeSingle();
  return c ? { title: c.title, description: c.description ?? undefined } : { title: "Collection" };
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { handle, slug } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: pData } = await supabase.from("profiles").select("*").eq("handle", handle.toLowerCase()).maybeSingle();
  if (!pData) notFound();
  const profile = pData as Profile;

  const { data: cData } = await supabase
    .from("collections")
    .select("*")
    .eq("creator_id", profile.id)
    .eq("slug", slug)
    .maybeSingle();
  if (!cData) notFound();
  const collection = cData as Collection;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = user?.id === profile.id;
  const isLive = collection.is_published && collection.moderation_status === "approved";

  // Anything not live is visible only to its owner (row level security also enforces this).
  if (!isLive && !isOwner) notFound();

  const { data: rData } = await supabase
    .from("resources")
    .select("*")
    .eq("collection_id", collection.id)
    .order("position", { ascending: true });
  const resources = (rData ?? []) as Resource[];

  let savedIds = new Set<string>();
  const ratings = new Map<string, { avg: number; count: number }>();
  if (resources.length > 0) {
    const ids = resources.map((r) => r.id);
    const { data: rt } = await supabase.rpc("ratings_for", { ids });
    for (const row of (rt ?? []) as { resource_id: string; avg_rating: number; n: number }[]) {
      ratings.set(row.resource_id, { avg: Number(row.avg_rating), count: Number(row.n) });
    }
    if (user) {
      const { data: sData } = await supabase.from("saves").select("resource_id").eq("user_id", user.id).in("resource_id", ids);
      savedIds = new Set(((sData ?? []) as { resource_id: string }[]).map((s) => s.resource_id));
    }
  }

  // Count the page view (one per person per hour), but never the creator looking at their own page.
  if (isLive && !isOwner) {
    try {
      const admin = createAdminClient();
      const hash = await actorHash(user?.id);
      const since = new Date(Date.now() - 3600 * 1000).toISOString();
      const { count } = await admin
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("type", "collection_view")
        .eq("collection_id", collection.id)
        .eq("actor_hash", hash)
        .gt("created_at", since);
      if (!count) {
        await admin.from("events").insert({ type: "collection_view", collection_id: collection.id, actor_hash: hash });
      }
    } catch {
      // Tracking must never break the page.
    }
  }

  const returnTo = `/c/${profile.handle}/${collection.slug}`;
  const creatorName = profile.display_name || profile.handle;
  const reelLink = collection.ig_permalink || collection.source_url;

  let banner: string | null = null;
  if (!collection.is_published) banner = "Draft preview. Only you can see this page until you publish it.";
  else if (collection.moderation_status === "pending") banner = "Waiting for review. Only you can see this page until it is approved.";
  else if (collection.moderation_status === "rejected") banner = "This collection was rejected by a moderator and is not public.";

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      {banner ? (
        <div className="flash error">
          {banner} <Link href={`/dashboard/collections/${collection.id}`}>Back to editor</Link>
        </div>
      ) : null}

      <Flash error={first(sp.error)} message={first(sp.message)} />

      <header>
        {collection.category ? <span className="badge">{collection.category}</span> : null}
        <h1 style={{ marginTop: "0.4rem" }}>{collection.title}</h1>
        {collection.description ? <p className="muted">{collection.description}</p> : null}
        <div className="creator-line small" style={{ marginTop: 0 }}>
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="avatar-sm" src={profile.avatar_url} alt="" />
          ) : null}
          <Link href={`/c/${profile.handle}`}>{creatorName}</Link>
          {profile.instagram_username ? <span className="verified">✓ Instagram verified</span> : null}
          {reelLink ? (
            <>
              <span className="muted">·</span>
              <a href={reelLink} target="_blank" rel="noopener noreferrer">
                Watch the original reel
              </a>
            </>
          ) : null}
        </div>
      </header>

      {isLive && resources.length > 0 ? (
        <form action={saveCollectionResources.bind(null, collection.id, returnTo)}>
          <button className="btn btn-ghost" type="submit">
            Save all {resources.length} to my library
          </button>
        </form>
      ) : null}

      <section className="card">
        {resources.length === 0 ? (
          <p className="muted">No resources in this collection yet.</p>
        ) : (
          resources.map((r) => (
            <ResourceItem
              key={r.id}
              resource={r}
              saved={savedIds.has(r.id)}
              returnTo={returnTo}
              hasGuide={Boolean(r.guide_path && r.guide_approved)}
              rating={ratings.get(r.id) ?? null}
              reportable={!isOwner}
            />
          ))
        )}
      </section>

      {!user ? (
        <p className="small muted">
          Want to keep these?{" "}
          <Link href={`/login?mode=signup&next=${encodeURIComponent(returnTo)}`}>Create a free account</Link> to save
          resources to your personal library. Opening links never needs an account.
        </p>
      ) : null}
    </div>
  );
}
