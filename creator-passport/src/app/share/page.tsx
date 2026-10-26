import Link from "next/link";
import Flash from "@/components/Flash";
import ResourceItem from "@/components/ResourceItem";
import { saveCollectionResources } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import { extractInstagramShortcode } from "@/lib/instagram";
import { first, type SearchParams } from "@/lib/params";
import type { Collection, Profile, Resource } from "@/lib/utils";

export const metadata = { title: "Share a reel" };
export const dynamic = "force-dynamic";

// Target of the phone's "Share" button once the site is installed as an app (see manifest.webmanifest),
// and of the "paste a reel link" box below for everyone else.
export default async function SharePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const shared = [first(sp.url), first(sp.text), first(sp.title), first(sp.link)].filter(Boolean).join(" ");
  const code = shared ? extractInstagramShortcode(shared) : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let collection: Collection | null = null;
  let creator: Profile | null = null;
  let resources: Resource[] = [];
  let savedIds = new Set<string>();

  if (code) {
    const { data: c } = await supabase.from("collections").select("*").eq("ig_shortcode", code).eq("is_published", true).maybeSingle();
    if (c) {
      collection = c as Collection;
      const [{ data: p }, { data: rs }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", collection.creator_id).maybeSingle(),
        supabase.from("resources").select("*").eq("collection_id", collection.id).order("position", { ascending: true }),
      ]);
      creator = p as Profile | null;
      resources = (rs ?? []) as Resource[];
      if (user && resources.length > 0) {
        const { data: sData } = await supabase
          .from("saves")
          .select("resource_id")
          .eq("user_id", user.id)
          .in("resource_id", resources.map((r) => r.id));
        savedIds = new Set(((sData ?? []) as { resource_id: string }[]).map((s) => s.resource_id));
      }
    }
  }

  const returnTo = `/share?${new URLSearchParams({ link: shared }).toString()}`;

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <div>
        <h1 style={{ fontSize: "2rem" }}>Save a reel's resources</h1>
        <p className="muted">
          Share a reel to Resource Passport, or paste its link here, and we'll find the resources the creator shared.
        </p>
      </div>

      <Flash error={first(sp.error)} message={first(sp.message)} />

      <form method="get" className="search">
        <input name="link" defaultValue={shared} placeholder="Paste an Instagram reel link" aria-label="Reel link" />
        <button className="btn" type="submit">
          Find resources
        </button>
      </form>

      {shared && !code ? (
        <div className="card muted">That doesn't look like an Instagram reel link. Open the reel, tap Share, then Copy link.</div>
      ) : null}

      {code && !collection ? (
        <div className="card">
          <p>
            This reel doesn't have a Passport collection yet. If you know the creator, ask them to connect their Instagram
            and add the resources.
          </p>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Meanwhile you can <Link href="/search">search all resources</Link>.
          </p>
        </div>
      ) : null}

      {collection ? (
        <section className="stack">
          <div className="card">
            <h2 style={{ marginBottom: "0.2rem" }}>{collection.title}</h2>
            <p className="small muted">
              by {creator ? <Link href={`/c/${creator.handle}`}>{creator.display_name || creator.handle}</Link> : "a creator"}
              {creator?.instagram_username ? " · ✓ Instagram verified" : ""}
            </p>
            {resources.length > 0 ? (
              <form action={saveCollectionResources.bind(null, collection.id, returnTo)}>
                <button className="btn" type="submit">
                  {user ? `Save all ${resources.length} to my library` : "Log in to save all"}
                </button>
              </form>
            ) : null}
          </div>

          <div className="card">
            {resources.length === 0 ? (
              <p className="muted">The creator hasn't added resources yet.</p>
            ) : (
              resources.map((r) => (
                <ResourceItem
                  key={r.id}
                  resource={r}
                  saved={savedIds.has(r.id)}
                  returnTo={returnTo}
                  hasGuide={Boolean(r.guide_path && r.guide_approved)}
                />
              ))
            )}
          </div>
        </section>
      ) : null}

      <details className="card">
        <summary>Share straight from Instagram (Android)</summary>
        <div className="small prose">
          <ol>
            <li>Open this site in Chrome on your Android phone and choose "Install app" or "Add to Home screen".</li>
            <li>In Instagram, open a reel, tap Share, then "Share to…" and pick Resource Passport.</li>
            <li>Tap "Save all" and the resources are in your library.</li>
          </ol>
          <p>iPhone doesn't support share targets for websites yet, so use the paste box above.</p>
        </div>
      </details>
    </div>
  );
}
