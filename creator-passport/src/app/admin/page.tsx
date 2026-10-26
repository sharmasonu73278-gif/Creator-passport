import Link from "next/link";
import Flash from "@/components/Flash";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { first, type SearchParams } from "@/lib/params";
import { hostOf } from "@/lib/utils";
import {
  approveGuide,
  approveItem,
  rejectGuide,
  rejectItem,
  resolveReport,
  setBan,
} from "@/app/admin/actions";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const admin = createAdminClient();

  const [reportsRes, resourcesRes, collectionsRes, guidesRes] = await Promise.all([
    admin
      .from("reports")
      .select("id,reason,details,created_at,resource_id,resources(title,url,collection_id)")
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(50),
    admin
      .from("resources")
      .select("id,title,url,description,moderation_note,collection_id,collections(title,creator_id,profiles(handle))")
      .eq("moderation_status", "pending")
      .order("created_at", { ascending: true })
      .limit(50),
    admin
      .from("collections")
      .select("id,title,description,moderation_note,profiles(handle)")
      .eq("moderation_status", "pending")
      .order("created_at", { ascending: true })
      .limit(50),
    admin
      .from("resources")
      .select("id,title,guide_name,collections(title,profiles(handle))")
      .not("guide_path", "is", null)
      .eq("guide_approved", false)
      .order("created_at", { ascending: true })
      .limit(50),
  ]);

  const reports = (reportsRes.data ?? []) as Row[];
  const resources = (resourcesRes.data ?? []) as Row[];
  const collections = (collectionsRes.data ?? []) as Row[];
  const guides = (guidesRes.data ?? []) as Row[];

  return (
    <div className="stack">
      <div>
        <h1 style={{ fontSize: "2rem" }}>Admin review queue</h1>
        <p className="muted">
          Open reports: {reports.length} · Resources waiting: {resources.length} · Collections waiting:{" "}
          {collections.length} · PDF guides waiting: {guides.length}
        </p>
      </div>
      <Flash error={first(sp.error)} message={first(sp.message)} />

      <section>
        <h2>Reports</h2>
        <div className="card">
          {reports.length === 0 ? <p className="muted">No open reports.</p> : null}
          {reports.map((r) => (
            <div className="resource" key={r.id} style={{ display: "block" }}>
              <h3>{r.resources?.title ?? "Deleted resource"}</h3>
              <p className="small muted">
                Reason: <strong>{r.reason}</strong>
                {r.details ? ` · "${r.details}"` : ""}
                {r.resources?.url ? ` · ${hostOf(r.resources.url)}` : ""}
              </p>
              <div className="actions">
                <form action={resolveReport.bind(null, r.id, "upheld")}>
                  <button className="btn btn-sm btn-danger" type="submit">
                    Uphold and remove
                  </button>
                </form>
                <form action={resolveReport.bind(null, r.id, "dismissed")}>
                  <button className="btn btn-sm btn-ghost" type="submit">
                    Dismiss
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Resources waiting for review</h2>
        <div className="card">
          {resources.length === 0 ? <p className="muted">Nothing waiting.</p> : null}
          {resources.map((r) => (
            <div className="resource" key={r.id} style={{ display: "block" }}>
              <h3>{r.title}</h3>
              <p className="small muted">
                by @{r.collections?.profiles?.handle ?? "unknown"} in "{r.collections?.title}" ·{" "}
                <a href={r.url} target="_blank" rel="noopener noreferrer">
                  {hostOf(r.url)}
                </a>
              </p>
              {r.description ? <p className="small">{r.description}</p> : null}
              {r.moderation_note ? <p className="small muted">Why it is here: {r.moderation_note}</p> : null}
              <div className="actions">
                <form action={approveItem.bind(null, "resources", r.id)}>
                  <button className="btn btn-sm" type="submit">
                    Approve
                  </button>
                </form>
                <form action={rejectItem.bind(null, "resources", r.id)}>
                  <button className="btn btn-sm btn-danger" type="submit">
                    Reject
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Collections waiting for review</h2>
        <div className="card">
          {collections.length === 0 ? <p className="muted">Nothing waiting.</p> : null}
          {collections.map((c) => (
            <div className="resource" key={c.id} style={{ display: "block" }}>
              <h3>{c.title}</h3>
              <p className="small muted">by @{c.profiles?.handle ?? "unknown"}</p>
              {c.description ? <p className="small">{c.description}</p> : null}
              {c.moderation_note ? <p className="small muted">Why it is here: {c.moderation_note}</p> : null}
              <div className="actions">
                <form action={approveItem.bind(null, "collections", c.id)}>
                  <button className="btn btn-sm" type="submit">
                    Approve
                  </button>
                </form>
                <form action={rejectItem.bind(null, "collections", c.id)}>
                  <button className="btn btn-sm btn-danger" type="submit">
                    Reject
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>PDF guides waiting for review</h2>
        <div className="card">
          {guides.length === 0 ? <p className="muted">Nothing waiting.</p> : null}
          {guides.map((g) => (
            <div className="resource" key={g.id} style={{ display: "block" }}>
              <h3>{g.guide_name ?? "guide.pdf"}</h3>
              <p className="small muted">
                for "{g.title}" by @{g.collections?.profiles?.handle ?? "unknown"} ·{" "}
                <Link href={`/guide/${g.id}`} target="_blank">
                  Open PDF
                </Link>
              </p>
              <div className="actions">
                <form action={approveGuide.bind(null, g.id)}>
                  <button className="btn btn-sm" type="submit">
                    Approve
                  </button>
                </form>
                <form action={rejectGuide.bind(null, g.id)}>
                  <button className="btn btn-sm btn-danger" type="submit">
                    Remove PDF
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Ban or unban a user</h2>
        <form action={setBan} className="card">
          <div className="row">
            <div className="field">
              <label htmlFor="handle">Handle</label>
              <input id="handle" name="handle" placeholder="creatorhandle" required />
            </div>
            <div className="field">
              <label htmlFor="action">Action</label>
              <select id="action" name="action" defaultValue="ban">
                <option value="ban">Ban (hides all their content)</option>
                <option value="unban">Unban</option>
              </select>
            </div>
          </div>
          <button className="btn btn-danger" type="submit">
            Apply
          </button>
        </form>
      </section>
    </div>
  );
}
