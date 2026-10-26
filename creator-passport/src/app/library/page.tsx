import Link from "next/link";
import { redirect } from "next/navigation";
import Flash from "@/components/Flash";
import ResourceItem from "@/components/ResourceItem";
import { submitFeedback } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import { saveUsage } from "@/lib/limits";
import { first, type SearchParams } from "@/lib/params";
import { KINDS, type Resource } from "@/lib/utils";

export const metadata = { title: "My library" };
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 3600 * 1000;

type Row = {
  created_at: string;
  resources:
    | (Resource & {
        collections: {
          title: string;
          slug: string;
          category: string | null;
          ig_permalink: string | null;
          profiles: {
            handle: string;
            display_name: string | null;
            avatar_url: string | null;
            instagram_username: string | null;
          } | null;
        } | null;
      })
    | null;
};

export default async function Library({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = (first(sp.q) ?? "").trim().toLowerCase();
  const kind = first(sp.kind) ?? "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/library");

  const [savesRes, feedbackRes, usage] = await Promise.all([
    supabase
      .from("saves")
      .select(
        "created_at, resources(id,collection_id,title,url,description,kind,pricing,position,guide_path,guide_approved, collections(title,slug,category,ig_permalink, profiles(handle,display_name,avatar_url,instagram_username)))"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("feedback").select("resource_id,rating").eq("user_id", user.id),
    saveUsage(supabase, user.id),
  ]);

  const rows = ((savesRes.data ?? []) as unknown as Row[]).filter((r) => r.resources);
  const myRatings = new Map<string, number>(
    ((feedbackRes.data ?? []) as { resource_id: string; rating: number }[]).map(
      (f) => [f.resource_id, f.rating] as [string, number]
    )
  );

  // Saved more than a day ago and not rated yet: ask how it went.
  const due = rows
    .filter((row) => Date.now() - new Date(row.created_at).getTime() > DAY_MS && !myRatings.has(row.resources!.id))
    .slice(0, 5);

  const filtered = rows.filter((row) => {
    const r = row.resources!;
    if (kind && r.kind !== kind) return false;
    if (!q) return true;
    const haystack = [
      r.title,
      r.description ?? "",
      r.collections?.title ?? "",
      r.collections?.category ?? "",
      r.collections?.profiles?.display_name ?? "",
      r.collections?.profiles?.handle ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  const returnTo = "/library";
  const pct = Math.min(100, Math.round((usage.used / usage.limit) * 100));

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <div>
        <h1 style={{ fontSize: "2rem" }}>My library</h1>
        <p className="muted">Everything you saved from every creator, in one place.</p>
      </div>

      <Flash error={first(sp.error)} message={first(sp.message)} />

      <div className="card">
        <div className="split small">
          <span>
            <strong>
              {usage.used} of {usage.limit}
            </strong>{" "}
            saves used ({usage.plan} plan)
          </span>
          <span className="muted">More saves with a paid plan are coming soon.</span>
        </div>
        <div style={{ background: "var(--accent-soft)", borderRadius: 999, height: 8, marginTop: "0.5rem" }}>
          <div
            style={{
              width: `${pct}%`,
              height: 8,
              borderRadius: 999,
              background: pct >= 90 ? "var(--stamp)" : "var(--accent)",
            }}
          />
        </div>
      </div>

      {due.length > 0 ? (
        <section className="card">
          <h2 style={{ fontSize: "1.15rem" }}>How did these work for you?</h2>
          <p className="small muted">
            You saved these over a day ago. A quick rating helps other people, and creators with good ratings rank higher.
            Your saves are never removed if you skip this.
          </p>
          {due.map((row) => {
            const r = row.resources!;
            const reel = r.collections?.ig_permalink;
            return (
              <div className="resource" key={r.id} style={{ display: "block" }}>
                <h3>{r.title}</h3>
                <form action={submitFeedback.bind(null, r.id, returnTo)}>
                  <div className="row">
                    <div className="field">
                      <label>Rating</label>
                      <select name="rating" defaultValue="" required>
                        <option value="" disabled>
                          Choose
                        </option>
                        <option value="5">5 · Excellent</option>
                        <option value="4">4 · Good</option>
                        <option value="3">3 · Okay</option>
                        <option value="2">2 · Poor</option>
                        <option value="1">1 · Did not work</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Did it work?</label>
                      <select name="worked" defaultValue="">
                        <option value="">Not sure</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </div>
                  </div>
                  <div className="field">
                    <label>Comment (optional)</label>
                    <input name="comment" maxLength={500} placeholder="What worked or didn't?" />
                  </div>
                  <div className="actions">
                    <button className="btn btn-sm" type="submit">
                      Send feedback
                    </button>
                    {reel ? (
                      <a className="btn btn-sm btn-ghost" href={reel} target="_blank" rel="noopener noreferrer">
                        Say thanks on the reel
                      </a>
                    ) : null}
                  </div>
                </form>
              </div>
            );
          })}
        </section>
      ) : null}

      <form className="search" method="get">
        <input name="q" defaultValue={first(sp.q) ?? ""} placeholder="Search title, creator or category" aria-label="Search" />
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

      <section className="card">
        {rows.length === 0 ? (
          <p className="muted">
            Nothing saved yet. Open a creator's collection and press Save on the resources you want to keep, or{" "}
            <Link href="/share">paste a reel link</Link>. <Link href="/search">Search resources</Link>
          </p>
        ) : filtered.length === 0 ? (
          <p className="muted">No saved resources match your search.</p>
        ) : (
          filtered.map((row) => {
            const r = row.resources!;
            const c = r.collections;
            const creator = c?.profiles;
            const mine = myRatings.get(r.id);
            return (
              <ResourceItem
                key={r.id}
                resource={r}
                saved
                returnTo={returnTo}
                hasGuide={Boolean(r.guide_path && r.guide_approved)}
                creator={creator ?? null}
                collection={c ? { title: c.title, slug: c.slug } : null}
                source={mine ? <>Your rating: ★ {mine}</> : undefined}
              />
            );
          })
        )}
      </section>
    </div>
  );
}
