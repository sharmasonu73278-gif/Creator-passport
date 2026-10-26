import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Collection, Profile } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return { title: `@${handle}` };
}

export default async function CreatorPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const supabase = await createClient();

  const { data: pData } = await supabase.from("profiles").select("*").eq("handle", handle.toLowerCase()).maybeSingle();
  if (!pData) notFound();
  const profile = pData as Profile;
  if (profile.is_banned) notFound();

  const { data: cData } = await supabase
    .from("collections")
    .select("*")
    .eq("creator_id", profile.id)
    .eq("is_published", true)
    .eq("moderation_status", "approved")
    .order("created_at", { ascending: false });
  const collections = (cData ?? []) as Collection[];

  // Where this creator sits in the ranking, if they are ranked.
  const { data: board } = await supabase.rpc("creator_leaderboard", { max_rows: 500 });
  const me = ((board ?? []) as { creator_id: string; rank: number; score: number }[]).find((r) => r.creator_id === profile.id);

  const links = [
    { label: profile.instagram_username ? `Instagram @${profile.instagram_username}` : "Instagram", href: profile.instagram_url },
    { label: "YouTube", href: profile.youtube_url },
    { label: "Website", href: profile.website_url },
  ].filter((l): l is { label: string; href: string } => Boolean(l.href));

  const name = profile.display_name || profile.handle;

  return (
    <div className="stack">
      <section className="card">
        <div className="actions" style={{ gap: "1rem", alignItems: "center" }}>
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="avatar" src={profile.avatar_url} alt="" />
          ) : (
            <div className="avatar" aria-hidden="true">
              {name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <span className="stamp" style={{ marginBottom: "0.4rem" }}>
              Resource Passport
            </span>
            <h1 style={{ fontSize: "1.8rem", marginBottom: 0 }}>{name}</h1>
            <div className="small muted">
              @{profile.handle}
              {profile.instagram_username ? <span className="verified"> · ✓ Instagram verified</span> : null}
              {me ? <span> · Rank #{Number(me.rank)}</span> : null}
            </div>
          </div>
        </div>
        {profile.bio ? <p style={{ marginTop: "1rem" }}>{profile.bio}</p> : null}
        {links.length > 0 ? (
          <div className="actions">
            {links.map((l) => (
              <a key={l.label} className="btn btn-sm btn-ghost" href={l.href} target="_blank" rel="noopener noreferrer">
                {l.label}
              </a>
            ))}
          </div>
        ) : null}
      </section>

      <section>
        <h2>Collections</h2>
        {collections.length === 0 ? (
          <div className="card muted">Nothing published yet.</div>
        ) : (
          <div className="grid">
            {collections.map((c) => (
              <Link
                key={c.id}
                href={`/c/${profile.handle}/${c.slug}`}
                className="card"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                {c.category ? <span className="badge">{c.category}</span> : null}
                <h3 style={{ marginTop: "0.4rem" }}>{c.title}</h3>
                {c.description ? (
                  <p className="muted small" style={{ marginBottom: 0 }}>
                    {c.description}
                  </p>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
