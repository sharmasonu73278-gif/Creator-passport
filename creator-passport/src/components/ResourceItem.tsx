import Link from "next/link";
import { reportResource, toggleSave } from "@/app/actions";
import { REPORT_REASONS, hostOf, type Resource } from "@/lib/utils";

type Props = {
  resource: Pick<Resource, "id" | "title" | "url" | "description" | "kind" | "pricing">;
  saved: boolean;
  returnTo: string;
  /** True when an approved PDF guide is attached. */
  hasGuide?: boolean;
  rating?: { avg: number; count: number } | null;
  creator?: {
    handle: string;
    display_name: string | null;
    avatar_url: string | null;
    instagram_username?: string | null;
  } | null;
  collection?: { title: string; slug: string } | null;
  /** Extra line under the resource, e.g. "Saved on ...". */
  source?: React.ReactNode;
  /** Show the "Report" control (hidden for the creator's own preview). */
  reportable?: boolean;
};

export default function ResourceItem({
  resource: r,
  saved,
  returnTo,
  hasGuide,
  rating,
  creator,
  collection,
  source,
  reportable = true,
}: Props) {
  const name = creator ? creator.display_name || creator.handle : "";
  return (
    <div className="resource">
      <div style={{ minWidth: 0 }}>
        <h3>{r.title}</h3>
        <div>
          <span className="badge">{r.kind}</span>
          <span className={`badge ${r.pricing === "paid" ? "paid" : ""}`}>{r.pricing}</span>
          {hasGuide ? <span className="badge">PDF guide</span> : null}
          <span className="domain">{hostOf(r.url)}</span>
          {rating && rating.count > 0 ? (
            <span className="rating" title={`${rating.count} rating${rating.count === 1 ? "" : "s"}`}>
              ★ {rating.avg} ({rating.count})
            </span>
          ) : null}
        </div>
        {r.description ? (
          <p className="muted small" style={{ marginTop: "0.4rem" }}>
            {r.description}
          </p>
        ) : null}

        {creator ? (
          <div className="creator-line small">
            {creator.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="avatar-sm" src={creator.avatar_url} alt="" />
            ) : (
              <span className="avatar-sm" aria-hidden="true">
                {name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <Link href={`/c/${creator.handle}`}>{name}</Link>
            {creator.instagram_username ? <span className="verified">✓ Instagram verified</span> : null}
            {collection ? (
              <>
                <span className="muted">·</span>
                <Link href={`/c/${creator.handle}/${collection.slug}`}>{collection.title}</Link>
              </>
            ) : null}
          </div>
        ) : null}

        {source ? <div className="small muted">{source}</div> : null}

        {reportable ? (
          <details className="edit">
            <summary className="muted">Report</summary>
            <form action={reportResource.bind(null, r.id, returnTo)} style={{ marginTop: "0.6rem" }}>
              <div className="row">
                <div className="field">
                  <label>Why?</label>
                  <select name="reason" defaultValue="" required>
                    <option value="" disabled>
                      Choose a reason
                    </option>
                    {REPORT_REASONS.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Details (optional)</label>
                  <input name="details" maxLength={500} />
                </div>
              </div>
              <button className="btn btn-sm btn-ghost" type="submit">
                Send report
              </button>
            </form>
          </details>
        ) : null}
      </div>

      <div className="resource-actions">
        <a className="btn btn-sm" href={`/go/${r.id}`} target="_blank" rel="noopener noreferrer">
          Open
        </a>
        {hasGuide ? (
          <a className="btn btn-sm btn-ghost" href={`/guide/${r.id}`} target="_blank" rel="noopener noreferrer">
            PDF
          </a>
        ) : null}
        <form action={toggleSave.bind(null, r.id, returnTo)}>
          <button type="submit" className={`btn btn-sm btn-ghost ${saved ? "save-on" : ""}`}>
            {saved ? "Saved ✓" : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}
