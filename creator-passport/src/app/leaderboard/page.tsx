import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Top creators" };
export const dynamic = "force-dynamic";

type Row = {
  rank: number;
  creator_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  instagram_username: string | null;
  score: number;
  resources: number;
  unique_clicks: number;
  saves: number;
  rating: number;
  rating_count: number;
};

export default async function Leaderboard() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("creator_leaderboard", { max_rows: 50 });
  const rows = (data ?? []) as Row[];

  return (
    <div className="stack" style={{ maxWidth: 860 }}>
      <div>
        <h1 style={{ fontSize: "2rem" }}>Top creators</h1>
        <p className="muted">Creators whose resources people actually open, save and rate well.</p>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <p className="muted">No ranked creators yet. Rankings appear once creators publish resources.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Creator</th>
                <th className="num">Score</th>
                <th className="num">Resources</th>
                <th className="num">People who clicked</th>
                <th className="num">Saves</th>
                <th className="num">Rating</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.creator_id}>
                  <td className="rank-num">{Number(r.rank)}</td>
                  <td>
                    <div className="creator-line" style={{ marginTop: 0 }}>
                      {r.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="avatar-sm" src={r.avatar_url} alt="" />
                      ) : (
                        <span className="avatar-sm" aria-hidden="true">
                          {(r.display_name || r.handle).slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <Link href={`/c/${r.handle}`}>{r.display_name || r.handle}</Link>
                      {r.instagram_username ? <span className="verified">✓</span> : null}
                    </div>
                  </td>
                  <td className="num">
                    <strong>{Number(r.score)}</strong>
                  </td>
                  <td className="num">{Number(r.resources)}</td>
                  <td className="num">{Number(r.unique_clicks)}</td>
                  <td className="num">{Number(r.saves)}</td>
                  <td className="num">
                    {Number(r.rating_count) > 0 ? `★ ${Number(r.rating)} (${Number(r.rating_count)})` : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <details className="card">
        <summary>How the ranking works</summary>
        <div className="small prose">
          <p>The score rewards what real people do, not what a creator can do alone:</p>
          <ul>
            <li>Each different person who opens a resource counts once (last 90 days). Refreshing does not add more.</li>
            <li>Saves count when someone other than the creator saves a resource.</li>
            <li>Ratings come only from people who saved the resource. Creators with few ratings start near 4.0 so one rating can't swing the score.</li>
            <li>Each report that an admin upholds lowers a creator's score.</li>
          </ul>
          <p>Only creators with published, approved resources are ranked. Banned creators are removed.</p>
        </div>
      </details>
    </div>
  );
}
