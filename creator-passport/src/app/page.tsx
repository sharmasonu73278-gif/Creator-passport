import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category: string | null;
  profiles: { handle: string; display_name: string | null } | null;
};

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("collections")
    .select("id,title,slug,description,category,profiles(handle,display_name)")
    .eq("is_published", true)
    .eq("moderation_status", "approved")
    .order("created_at", { ascending: false })
    .limit(12);

  const collections = (data ?? []) as unknown as Row[];

  return (
    <div className="stack">
      <section className="hero">
        <span className="stamp">Resource Passport</span>
        <h1>Every resource from the reel, in one place.</h1>
        <p className="lead">
          Creators share GitHub repos, AI tools, courses and templates in their videos. Open them
          from one clean page, save the ones you like, and find them again later.
        </p>
        <div className="actions">
          <Link href="/login?mode=signup" className="btn">
            Create your passport
          </Link>
          <Link href="/search" className="btn btn-ghost">
            Search resources
          </Link>
          <Link href="/share" className="btn btn-ghost">
            Paste a reel link
          </Link>
        </div>
      </section>

      <section id="latest">
        <h2>Latest collections</h2>
        {collections.length === 0 ? (
          <div className="card muted">
            No collections yet. Be the first creator to{" "}
            <Link href="/login?mode=signup">publish one</Link>.
          </div>
        ) : (
          <div className="grid">
            {collections.map((c) => (
              <Link
                key={c.id}
                href={`/c/${c.profiles?.handle ?? "unknown"}/${c.slug}`}
                className="card"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                {c.category ? <span className="badge">{c.category}</span> : null}
                <h3 style={{ marginTop: "0.4rem" }}>{c.title}</h3>
                {c.description ? <p className="muted small">{c.description}</p> : null}
                <p className="small" style={{ color: "var(--accent)", marginBottom: 0 }}>
                  by {c.profiles?.display_name ?? c.profiles?.handle ?? "a creator"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
