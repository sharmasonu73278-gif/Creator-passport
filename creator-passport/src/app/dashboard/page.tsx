import Link from "next/link";
import { redirect } from "next/navigation";
import Flash from "@/components/Flash";
import { disconnectInstagram, syncInstagramAction } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import { instagramConfigured } from "@/lib/instagram";
import { first, type SearchParams } from "@/lib/params";
import type { Collection, Profile } from "@/lib/utils";

export const metadata = { title: "Creator dashboard" };
export const dynamic = "force-dynamic";

type ResourceStat = { collection_id: string; resource_id: string; clicks: number; saves: number };
type DailyStat = { day: string; views: number; clicks: number };
type FeedbackRow = {
  resource_id: string;
  resource_title: string;
  rating: number;
  worked: boolean | null;
  comment: string | null;
  created_at: string;
};

function Bars({ values, alt }: { values: number[]; alt?: boolean }) {
  const max = Math.max(1, ...values);
  return (
    <div className={`bars ${alt ? "alt" : ""}`} aria-hidden="true">
      {values.map((v, i) => (
        <div key={i} className="bar-col" style={{ height: `${Math.max(3, (v / max) * 100)}%` }} />
      ))}
    </div>
  );
}

function statusBadge(c: Collection) {
  if (!c.is_published) return <span className="badge draft">draft</span>;
  if (c.moderation_status === "pending") return <span className="badge draft">in review</span>;
  if (c.moderation_status === "rejected") return <span className="badge paid">rejected</span>;
  return null;
}

export default async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard");

  const [profileRes, collectionsRes, statsRes, dailyRes, feedbackRes, reelsRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("collections").select("*").eq("creator_id", user.id).order("created_at", { ascending: false }),
    supabase.rpc("creator_resource_stats"),
    supabase.rpc("creator_daily_stats"),
    supabase.rpc("creator_feedback"),
    supabase.from("instagram_reels").select("ig_media_id", { count: "exact", head: true }).eq("creator_id", user.id),
  ]);

  const profile = profileRes.data as Profile | null;
  const collections = (collectionsRes.data ?? []) as Collection[];
  const stats = ((statsRes.data ?? []) as ResourceStat[]).map((s) => ({
    ...s,
    clicks: Number(s.clicks),
    saves: Number(s.saves),
  }));
  const daily = ((dailyRes.data ?? []) as DailyStat[]).map((d) => ({
    day: d.day,
    views: Number(d.views),
    clicks: Number(d.clicks),
  }));
  const feedback = ((feedbackRes.data ?? []) as FeedbackRow[]).slice(0, 8);
  const reelCount = reelsRes.count ?? 0;
  const connected = Boolean(profile?.instagram_user_id);

  // Per-collection page views (all time).
  const viewCounts = await Promise.all(
    collections.map(async (c) => {
      const { count } = await supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("collection_id", c.id)
        .eq("type", "collection_view");
      return [c.id, count ?? 0] as const;
    })
  );
  const viewsByCollection = new Map<string, number>(viewCounts);

  // Titles for the top-resources table.
  const collectionIds = collections.map((c) => c.id);
  let resourceTitles = new Map<string, { title: string; collection: string }>();
  if (collectionIds.length > 0) {
    const { data: rs } = await supabase
      .from("resources")
      .select("id,title,collection_id")
      .in("collection_id", collectionIds);
    const titleOfCollection = new Map<string, string>(
      collections.map((c) => [c.id, c.title] as [string, string])
    );
    resourceTitles = new Map<string, { title: string; collection: string }>(
      ((rs ?? []) as { id: string; title: string; collection_id: string }[]).map(
        (r) =>
          [
            r.id,
            { title: r.title, collection: titleOfCollection.get(r.collection_id) ?? "" },
          ] as [string, { title: string; collection: string }]
      )
    );
  }

  const totalViews30 = daily.reduce((a, d) => a + d.views, 0);
  const totalClicks30 = daily.reduce((a, d) => a + d.clicks, 0);
  const totalSaves = stats.reduce((a, s) => a + s.saves, 0);
  const topResources = [...stats]
    .sort((a, b) => b.clicks + b.saves - (a.clicks + a.saves))
    .slice(0, 8)
    .filter((s) => s.clicks + s.saves > 0);

  const clicksByCollection = new Map<string, number>();
  const savesByCollection = new Map<string, number>();
  for (const s of stats) {
    clicksByCollection.set(s.collection_id, (clicksByCollection.get(s.collection_id) ?? 0) + s.clicks);
    savesByCollection.set(s.collection_id, (savesByCollection.get(s.collection_id) ?? 0) + s.saves);
  }

  return (
    <div className="stack">
      <div className="split">
        <div>
          <h1 style={{ fontSize: "2rem" }}>Creator dashboard</h1>
          {profile ? (
            <p className="muted">
              Your public passport: <Link href={`/c/${profile.handle}`}>/c/{profile.handle}</Link>
            </p>
          ) : null}
        </div>
        <div className="actions">
          <Link href="/dashboard/profile" className="btn btn-ghost">
            Edit profile
          </Link>
          {connected ? (
            <Link href="/dashboard/collections/new" className="btn">
              New collection
            </Link>
          ) : null}
        </div>
      </div>

      <Flash error={first(sp.error)} message={first(sp.message)} />

      <section className="card">
        <h2 style={{ fontSize: "1.15rem" }}>Instagram</h2>
        {connected && profile ? (
          <>
            <div className="creator-line" style={{ marginTop: 0 }}>
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="avatar-sm" src={profile.avatar_url} alt="" style={{ width: 36, height: 36 }} />
              ) : null}
              <span>
                <strong>{profile.display_name}</strong>{" "}
                <span className="verified">✓ Connected as @{profile.instagram_username}</span>
                <br />
                <span className="small muted">
                  {reelCount} reels available. Your name and photo are taken from Instagram.
                </span>
              </span>
            </div>
            <div className="actions" style={{ marginTop: "0.8rem" }}>
              <form action={syncInstagramAction}>
                <button className="btn btn-sm btn-ghost" type="submit">
                  Sync reels and profile
                </button>
              </form>
              <form action={disconnectInstagram}>
                <button className="btn btn-sm btn-danger" type="submit">
                  Disconnect
                </button>
              </form>
            </div>
          </>
        ) : (
          <>
            <p className="muted">
              Connect your Instagram to prove which reels are yours. You can then create a collection only for your own
              reels, and your name and profile photo are copied from Instagram.
            </p>
            <p className="small muted">
              Only Instagram business and creator accounts can connect (switching is free in Instagram's settings).
              Personal accounts are not supported by Instagram's API.
            </p>
            {instagramConfigured() ? (
              <a className="btn" href="/api/instagram/connect">
                Connect Instagram
              </a>
            ) : (
              <div className="flash error" style={{ marginBottom: 0 }}>
                Instagram connection isn't configured on this server yet. See the README, "Instagram setup".
              </div>
            )}
          </>
        )}
      </section>

      <section>
        <h2>Last 30 days</h2>
        <div className="stats">
          <div className="stat">
            <div className="n">{totalViews30}</div>
            <div className="l">Collection page views</div>
          </div>
          <div className="stat">
            <div className="n">{totalClicks30}</div>
            <div className="l">Resource clicks</div>
          </div>
          <div className="stat">
            <div className="n">{totalSaves}</div>
            <div className="l">Saves, all time</div>
          </div>
        </div>
        <div className="card" style={{ marginTop: "1rem" }}>
          <div className="split small muted">
            <span>Daily page views</span>
          </div>
          <Bars values={daily.map((d) => d.views)} />
          <div className="small muted" style={{ marginTop: "0.8rem" }}>
            Daily resource clicks
          </div>
          <Bars values={daily.map((d) => d.clicks)} alt />
          <p className="hint" style={{ marginBottom: 0 }}>
            These numbers are measured on this site only. They are not Instagram views or shares. Your own visits are
            not counted, and one person counts once per hour.
          </p>
        </div>
      </section>

      <section>
        <h2>Your collections</h2>
        {collections.length === 0 ? (
          <div className="card muted">
            {connected
              ? "You have no collections yet. Create one for a reel, add its resources and publish it."
              : "Connect Instagram first, then create a collection for one of your reels."}
          </div>
        ) : (
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Collection</th>
                  <th className="num">Views</th>
                  <th className="num">Clicks</th>
                  <th className="num">Saves</th>
                </tr>
              </thead>
              <tbody>
                {collections.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/dashboard/collections/${c.id}`}>{c.title}</Link> {statusBadge(c)}
                    </td>
                    <td className="num">{viewsByCollection.get(c.id) ?? 0}</td>
                    <td className="num">{clicksByCollection.get(c.id) ?? 0}</td>
                    <td className="num">{savesByCollection.get(c.id) ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {topResources.length > 0 ? (
        <section>
          <h2>Top resources</h2>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Collection</th>
                  <th className="num">Clicks</th>
                  <th className="num">Saves</th>
                </tr>
              </thead>
              <tbody>
                {topResources.map((s) => {
                  const meta = resourceTitles.get(s.resource_id);
                  return (
                    <tr key={s.resource_id}>
                      <td>{meta?.title ?? "Untitled"}</td>
                      <td className="muted">{meta?.collection}</td>
                      <td className="num">{s.clicks}</td>
                      <td className="num">{s.saves}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {feedback.length > 0 ? (
        <section>
          <h2>Recent feedback</h2>
          <div className="card">
            {feedback.map((f, i) => (
              <div className="resource" key={`${f.resource_id}-${i}`} style={{ display: "block" }}>
                <div className="small">
                  <strong>{f.resource_title}</strong> · ★ {f.rating}
                  {f.worked === true ? " · worked for them" : f.worked === false ? " · did not work" : ""}
                </div>
                {f.comment ? <p className="small muted" style={{ marginBottom: 0 }}>{f.comment}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
