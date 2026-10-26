import Link from "next/link";
import Flash from "@/components/Flash";
import ResourceItem from "@/components/ResourceItem";
import { createClient } from "@/lib/supabase/server";
import { first, type SearchParams } from "@/lib/params";
import { KINDS, type Kind, type Pricing } from "@/lib/utils";

export const metadata = { title: "Search" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;

type Hit = {
  resource_id: string;
  title: string;
  description: string | null;
  kind: Kind;
  pricing: Pricing;
  has_guide: boolean;
  collection_id: string;
  collection_title: string;
  collection_slug: string;
  category: string | null;
  creator_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  instagram_username: string | null;
  rating: number | null;
  rating_count: number;
};

type CreatorHit = {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  instagram_username: string | null;
  bio: string | null;
};

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = (first(sp.q) ?? "").trim().slice(0, 100);
  const kindRaw = first(sp.kind) ?? "";
  const kind = (KINDS as readonly string[]).includes(kindRaw) ? kindRaw : "";
  const page = Math.max(1, Math.min(50, Number(first(sp.page)) || 1));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let hits: Hit[] = [];
  let creators: CreatorHit[] = [];
  let hasMore = false;

  if (q) {
    const { data } = await supabase.rpc("search_resources", {
      q,
      kind_filter: kind || null,
      page_limit: PAGE_SIZE + 1,
      page_offset: (page - 1) * PAGE_SIZE,
    });
    const rows = (data ?? []) as Hit[];
    hasMore = rows.length > PAGE_SIZE;
    hits = rows.slice(0, PAGE_SIZE);

    if (page === 1) {
      // Keep only letters, numbers, spaces, dot, dash and underscore so the text is safe inside a filter.
      const safe = q.replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 50);
      if (safe) {
        const { data: cData } = await supabase
          .from("profiles")
          .select("id,handle,display_name,avatar_url,instagram_username,bio")
          .eq("is_banned", false)
          .or(`handle.ilike.%${safe}%,display_name.ilike.%${safe}%`)
          .limit(5);
        creators = (cData ?? []) as CreatorHit[];
      }
    }
  }

  let savedIds = new Set<string>();
  if (user && hits.length > 0) {
    const { data: sData } = await supabase
      .from("saves")
      .select("resource_id")
      .eq("user_id", user.id)
      .in("resource_id", hits.map((h) => h.resource_id));
    savedIds = new Set(((sData ?? []) as { resource_id: string }[]).map((s) => s.resource_id));
  }

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (kind) params.set("kind", kind);
  if (page > 1) params.set("page", String(page));
  const returnTo = `/search${params.toString() ? `?${params.toString()}` : ""}`;

  const pageLink = (p: number) => {
    const next = new URLSearchParams();
    next.set("q", q);
    if (kind) next.set("kind", kind);
    if (p > 1) next.set("page", String(p));
    return `/search?${next.toString()}`;
  };

  return (
    <div className="stack" style={{ maxWidth: 800 }}>
      <div>
        <h1 style={{ fontSize: "2rem" }}>Search resources</h1>
        <p className="muted">Find a repo, tool, course or template by name, topic, creator or collection.</p>
      </div>

      <form className="search" method="get">
        <input name="q" defaultValue={q} placeholder="e.g. python projects, ChatGPT prompts, free course" aria-label="Search" maxLength={100} />
        <select name="kind" defaultValue={kind} aria-label="Type">
          <option value="">All types</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          Search
        </button>
      </form>

      <Flash error={first(sp.error)} message={first(sp.message)} />

      {!q ? (
        <div className="card muted">
          Type something above to search every published resource. Looking for the best creators instead?{" "}
          <Link href="/leaderboard">See the leaderboard</Link>.
        </div>
      ) : null}

      {creators.length > 0 ? (
        <section>
          <h2>Creators</h2>
          <div className="grid">
            {creators.map((c) => (
              <Link
                key={c.id}
                href={`/c/${c.handle}`}
                className="card creator-line"
                style={{ textDecoration: "none", color: "inherit", marginTop: 0 }}
              >
                {c.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="avatar-sm" src={c.avatar_url} alt="" style={{ width: 40, height: 40 }} />
                ) : (
                  <span className="avatar-sm" style={{ width: 40, height: 40 }} aria-hidden="true">
                    {(c.display_name || c.handle).slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span>
                  <strong>{c.display_name || c.handle}</strong>
                  <br />
                  <span className="small muted">
                    @{c.handle}
                    {c.instagram_username ? " · ✓ Instagram verified" : ""}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {q ? (
        <section>
          <h2>Resources</h2>
          <div className="card">
            {hits.length === 0 ? (
              <p className="muted">No resources found for "{q}". Try a shorter or different word.</p>
            ) : (
              hits.map((h) => (
                <ResourceItem
                  key={h.resource_id}
                  resource={{
                    id: h.resource_id,
                    title: h.title,
                    description: h.description,
                    kind: h.kind,
                    pricing: h.pricing,
                    url: "",
                  }}
                  saved={savedIds.has(h.resource_id)}
                  returnTo={returnTo}
                  hasGuide={h.has_guide}
                  rating={h.rating ? { avg: Number(h.rating), count: Number(h.rating_count) } : null}
                  creator={{
                    handle: h.handle,
                    display_name: h.display_name,
                    avatar_url: h.avatar_url,
                    instagram_username: h.instagram_username,
                  }}
                  collection={{ title: h.collection_title, slug: h.collection_slug }}
                />
              ))
            )}
          </div>

          {page > 1 || hasMore ? (
            <div className="actions" style={{ marginTop: "1rem" }}>
              {page > 1 ? (
                <Link className="btn btn-ghost btn-sm" href={pageLink(page - 1)}>
                  ← Previous
                </Link>
              ) : null}
              {hasMore ? (
                <Link className="btn btn-ghost btn-sm" href={pageLink(page + 1)}>
                  Next →
                </Link>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
