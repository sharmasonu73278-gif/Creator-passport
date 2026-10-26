import Link from "next/link";
import Flash from "@/components/Flash";
import { createCollection } from "@/app/actions";
import { requireUser } from "@/lib/auth";
import { first, type SearchParams } from "@/lib/params";
import { CATEGORIES } from "@/lib/utils";

export const metadata = { title: "New collection" };
export const dynamic = "force-dynamic";

type Reel = { ig_media_id: string; caption: string | null; thumbnail_url: string | null; posted_at: string | null };

export default async function NewCollection({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser("/dashboard/collections/new");

  const { data: me } = await supabase.from("profiles").select("instagram_user_id").eq("id", user.id).maybeSingle();
  const connected = Boolean(me?.instagram_user_id);

  let available: Reel[] = [];
  if (connected) {
    const [{ data: reels }, { data: used }] = await Promise.all([
      supabase
        .from("instagram_reels")
        .select("ig_media_id,caption,thumbnail_url,posted_at")
        .eq("creator_id", user.id)
        .order("posted_at", { ascending: false })
        .limit(150),
      supabase.from("collections").select("ig_media_id").eq("creator_id", user.id).not("ig_media_id", "is", null),
    ]);
    const taken = new Set(((used ?? []) as { ig_media_id: string }[]).map((u) => u.ig_media_id));
    available = ((reels ?? []) as Reel[]).filter((r) => !taken.has(r.ig_media_id));
  }

  return (
    <div style={{ maxWidth: 760 }} className="stack">
      <div>
        <Link href="/dashboard" className="small">
          ← Dashboard
        </Link>
        <h1 style={{ fontSize: "2rem", marginTop: "0.5rem" }}>New collection</h1>
        <p className="muted">Pick one of your own Instagram reels. You add its resources on the next step.</p>
      </div>

      <Flash error={first(sp.error)} />

      {!connected ? (
        <div className="card">
          <p>Connect your Instagram account first, so we can confirm the reel is yours.</p>
          <Link href="/dashboard" className="btn">
            Go to Instagram connection
          </Link>
        </div>
      ) : available.length === 0 ? (
        <div className="card">
          <p>No reels available. Either every reel already has a collection, or none were found.</p>
          <p className="small muted">Posted a new reel? Use "Sync reels and profile" on your dashboard.</p>
        </div>
      ) : (
        <form action={createCollection} className="stack">
          <div className="card">
            <h2 style={{ fontSize: "1.1rem" }}>1. Choose the reel</h2>
            <div className="reel-pick">
              {available.map((r, i) => (
                <label key={r.ig_media_id}>
                  <input type="radio" name="ig_media_id" value={r.ig_media_id} required defaultChecked={i === 0} />
                  <span className="reel-card">
                    {r.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.thumbnail_url} alt="" referrerPolicy="no-referrer" loading="lazy" />
                    ) : (
                      <span className="noimg" />
                    )}
                    <span className="cap">{r.caption || "Reel"}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 style={{ fontSize: "1.1rem" }}>2. Describe it</h2>
            <div className="field">
              <label htmlFor="title">Title</label>
              <input id="title" name="title" maxLength={140} placeholder="Leave empty to use the first line of the reel caption" />
            </div>
            <div className="field">
              <label htmlFor="description">Short description</label>
              <textarea id="description" name="description" maxLength={600} />
            </div>
            <div className="field">
              <label htmlFor="category">Category</label>
              <select id="category" name="category" defaultValue="">
                <option value="">Choose one</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn" type="submit">
              Create and add resources
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
