import Link from "next/link";
import { redirect } from "next/navigation";
import Flash from "@/components/Flash";
import { updateProfile } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import { first, type SearchParams } from "@/lib/params";
import type { Profile } from "@/lib/utils";

export const metadata = { title: "Edit profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/profile");

  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const p = data as Profile | null;
  if (!p) redirect("/dashboard");
  const connected = Boolean(p.instagram_user_id);

  return (
    <div style={{ maxWidth: 620 }} className="stack">
      <div>
        <Link href="/dashboard" className="small">
          ← Dashboard
        </Link>
        <h1 style={{ fontSize: "2rem", marginTop: "0.5rem" }}>Your profile</h1>
        <p className="muted">This is what people see on your public passport page.</p>
      </div>

      <Flash error={first(sp.error)} message={first(sp.message)} />

      <form action={updateProfile} className="card">
        <div className="field">
          <label htmlFor="handle">Handle</label>
          <input
            id="handle"
            name="handle"
            defaultValue={p.handle}
            required
            pattern="[a-z0-9_]{3,30}"
            title="3-30 characters: lowercase letters, numbers, underscore"
          />
          <div className="hint">Your page will live at /c/{p.handle}. Changing it changes the link.</div>
        </div>

        {connected ? (
          <>
            <div className="field">
              <label>Name</label>
              <input className="locked" value={p.display_name ?? ""} readOnly aria-readonly="true" />
              <div className="hint">
                Taken from your Instagram (@{p.instagram_username}). Change it on Instagram, then press "Sync reels and profile" on
                your dashboard.
              </div>
            </div>
            <div className="field">
              <label>Profile photo</label>
              {p.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="avatar" src={p.avatar_url} alt="" />
              ) : (
                <div className="muted small">No photo found on Instagram.</div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="display_name">Display name</label>
              <input id="display_name" name="display_name" defaultValue={p.display_name ?? ""} maxLength={80} />
              <div className="hint">Connect Instagram on your dashboard to use your Instagram name and photo automatically.</div>
            </div>
            <div className="field">
              <label htmlFor="avatar_url">Profile image link</label>
              <input id="avatar_url" name="avatar_url" defaultValue={p.avatar_url ?? ""} placeholder="https://..." />
            </div>
            <div className="field">
              <label htmlFor="instagram_url">Instagram link</label>
              <input id="instagram_url" name="instagram_url" defaultValue={p.instagram_url ?? ""} placeholder="https://instagram.com/you" />
            </div>
          </>
        )}

        <div className="field">
          <label htmlFor="bio">Bio</label>
          <textarea id="bio" name="bio" defaultValue={p.bio ?? ""} maxLength={400} />
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="youtube_url">YouTube</label>
            <input id="youtube_url" name="youtube_url" defaultValue={p.youtube_url ?? ""} placeholder="https://youtube.com/@you" />
          </div>
          <div className="field">
            <label htmlFor="website_url">Website</label>
            <input id="website_url" name="website_url" defaultValue={p.website_url ?? ""} placeholder="https://..." />
          </div>
        </div>
        <button className="btn" type="submit">
          Save profile
        </button>
      </form>
    </div>
  );
}
