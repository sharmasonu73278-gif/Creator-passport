import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Flash from "@/components/Flash";
import {
  addResource,
  deleteCollection,
  deleteResource,
  setPublished,
  updateCollection,
  updateResource,
} from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import { first, type SearchParams } from "@/lib/params";
import { CATEGORIES, KINDS, PRICING, hostOf, type Collection, type Profile, type Resource } from "@/lib/utils";

export const metadata = { title: "Edit collection" };
export const dynamic = "force-dynamic";

type Stat = { resource_id: string; clicks: number; saves: number };

function ResourceFields({ r }: { r?: Resource }) {
  return (
    <>
      <div className="row">
        <div className="field">
          <label>Title</label>
          <input name="title" required maxLength={140} defaultValue={r?.title ?? ""} />
        </div>
        <div className="field">
          <label>Link</label>
          <input name="url" required defaultValue={r?.url ?? ""} placeholder="https://github.com/..." />
        </div>
      </div>
      <div className="field">
        <label>What is it? (one line)</label>
        <input name="description" maxLength={400} defaultValue={r?.description ?? ""} />
      </div>
      <div className="row">
        <div className="field">
          <label>Type</label>
          <select name="kind" defaultValue={r?.kind ?? "website"}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Price</label>
          <select name="pricing" defaultValue={r?.pricing ?? "free"}>
            {PRICING.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Step-by-step PDF guide (optional, max 10 MB)</label>
        <input name="guide" type="file" accept="application/pdf" />
        <div className="hint">
          Explain how to use this resource. New PDFs are checked before they appear to readers.
          {r?.guide_path ? ` Current file: ${r.guide_name ?? "guide.pdf"}. Uploading a new one replaces it.` : ""}
        </div>
        {r?.guide_path ? (
          <label style={{ fontWeight: 400, marginTop: "0.4rem" }}>
            <input type="checkbox" name="remove_guide" style={{ width: "auto", marginRight: "0.4rem" }} />
            Remove the current PDF
          </label>
        ) : null}
      </div>
    </>
  );
}

function resourceBadge(r: Resource) {
  if (r.moderation_status === "pending") return <span className="badge draft">in review</span>;
  if (r.moderation_status === "rejected") return <span className="badge paid">rejected</span>;
  return null;
}

export default async function EditCollection({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/dashboard/collections/${id}`);

  const { data: cData } = await supabase
    .from("collections")
    .select("*")
    .eq("id", id)
    .eq("creator_id", user.id)
    .maybeSingle();
  if (!cData) notFound();
  const c = cData as Collection;

  const [{ data: rData }, { data: pData }, { data: sData }] = await Promise.all([
    supabase.from("resources").select("*").eq("collection_id", id).order("position", { ascending: true }),
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.rpc("creator_resource_stats"),
  ]);
  const resources = (rData ?? []) as Resource[];
  const profile = pData as Profile | null;
  const statMap = new Map<string, Stat>(
    ((sData ?? []) as Stat[]).map(
      (s) => [s.resource_id, { ...s, clicks: Number(s.clicks), saves: Number(s.saves) }] as [string, Stat]
    )
  );
  const publicPath = profile ? `/c/${profile.handle}/${c.slug}` : null;
  const isLive = c.is_published && c.moderation_status === "approved";

  let statusBadge = <span className="badge draft">draft</span>;
  if (isLive) statusBadge = <span className="badge">published</span>;
  else if (c.is_published && c.moderation_status === "pending") statusBadge = <span className="badge draft">in review</span>;
  else if (c.moderation_status === "rejected") statusBadge = <span className="badge paid">rejected</span>;

  return (
    <div style={{ maxWidth: 760 }} className="stack">
      <div>
        <Link href="/dashboard" className="small">
          ← Dashboard
        </Link>
        <div className="split" style={{ marginTop: "0.5rem" }}>
          <h1 style={{ fontSize: "2rem" }}>{c.title}</h1>
          {statusBadge}
        </div>
        {publicPath ? (
          <p className="muted small">
            Share this link: <code>{publicPath}</code>{" "}
            <Link href={publicPath}>{isLive ? "View page" : "Preview"}</Link>
          </p>
        ) : null}
        {c.ig_permalink ? (
          <p className="small muted">
            Verified reel:{" "}
            <a href={c.ig_permalink} target="_blank" rel="noopener noreferrer">
              {c.ig_permalink}
            </a>
          </p>
        ) : (
          <p className="small" style={{ color: "var(--stamp)" }}>
            This collection is not linked to one of your reels, so it cannot be published. Create a new collection from
            your connected Instagram reels.
          </p>
        )}
        {c.moderation_note && c.moderation_status !== "approved" ? (
          <p className="small muted">Review note: {c.moderation_note}</p>
        ) : null}
      </div>

      <Flash error={first(sp.error)} message={first(sp.message)} />

      <div className="card actions">
        {c.is_published ? (
          <form action={setPublished.bind(null, c.id, false)}>
            <button className="btn btn-ghost" type="submit">
              Unpublish
            </button>
          </form>
        ) : (
          <form action={setPublished.bind(null, c.id, true)}>
            <button className="btn" type="submit" disabled={!c.ig_media_id}>
              Publish
            </button>
          </form>
        )}
        <span className="small muted">
          {isLive
            ? "Anyone with the link can see it. You can keep editing and the link stays the same."
            : c.is_published
              ? "Waiting for review. It goes live automatically once approved."
              : "Only you can see it until you publish."}
        </span>
      </div>

      <section>
        <h2>Resources</h2>
        <div className="card">
          {resources.length === 0 ? <p className="muted">No resources yet. Add the first one below.</p> : null}
          {resources.map((r) => {
            const s = statMap.get(r.id);
            return (
              <div className="resource" key={r.id} style={{ display: "block" }}>
                <div className="split">
                  <div>
                    <h3>{r.title}</h3>
                    <span className="badge">{r.kind}</span>
                    <span className={`badge ${r.pricing === "paid" ? "paid" : ""}`}>{r.pricing}</span>
                    {resourceBadge(r)}
                    {r.guide_path ? (
                      <span className={`badge ${r.guide_approved ? "" : "draft"}`}>
                        {r.guide_approved ? "PDF guide" : "PDF in review"}
                      </span>
                    ) : null}
                    <span className="small muted">{hostOf(r.url)}</span>
                    {r.moderation_note && r.moderation_status !== "approved" ? (
                      <div className="small muted">Review note: {r.moderation_note}</div>
                    ) : null}
                  </div>
                  <div className="small muted">
                    {s?.clicks ?? 0} clicks · {s?.saves ?? 0} saves
                  </div>
                </div>
                <details className="edit">
                  <summary>Edit</summary>
                  <form action={updateResource.bind(null, c.id, r.id)} style={{ marginTop: "0.8rem" }}>
                    <ResourceFields r={r} />
                    <button className="btn btn-sm" type="submit">
                      Save changes
                    </button>
                  </form>
                  <form action={deleteResource.bind(null, c.id, r.id)} style={{ marginTop: "0.5rem" }}>
                    <button className="btn btn-sm btn-danger" type="submit">
                      Remove resource
                    </button>
                  </form>
                </details>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2>Add a resource</h2>
        <form action={addResource.bind(null, c.id)} className="card">
          <ResourceFields />
          <button className="btn" type="submit">
            Add resource
          </button>
        </form>
      </section>

      <section>
        <h2>Collection details</h2>
        <form action={updateCollection.bind(null, c.id)} className="card">
          <div className="field">
            <label htmlFor="title">Title</label>
            <input id="title" name="title" required maxLength={140} defaultValue={c.title} />
          </div>
          <div className="field">
            <label htmlFor="description">Short description</label>
            <textarea id="description" name="description" maxLength={600} defaultValue={c.description ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="category">Category</label>
            <select id="category" name="category" defaultValue={c.category ?? ""}>
              <option value="">None</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <button className="btn" type="submit">
            Save details
          </button>
        </form>
      </section>

      <section>
        <h2>Danger zone</h2>
        <form action={deleteCollection.bind(null, c.id)} className="card">
          <p className="small muted">
            Deleting removes the collection, its resources, PDF guides and stats. Saved copies disappear from readers' libraries.
          </p>
          <button className="btn btn-danger" type="submit">
            Delete collection
          </button>
        </form>
      </section>
    </div>
  );
}
