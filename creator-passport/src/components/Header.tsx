import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions";

export default async function Header() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  if (user) {
    const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
    isAdmin = Boolean(me?.is_admin);
  }

  return (
    <header className="site-header">
      <div className="container bar">
        <Link href="/" className="brand">
          <span className="brand-mark">◈</span> Resource Passport
        </Link>

        <form action="/search" method="get" className="header-search" role="search">
          <input name="q" placeholder="Search resources, creators, topics" aria-label="Search" maxLength={100} />
        </form>

        <nav>
          <Link href="/leaderboard">Top creators</Link>
          {user ? (
            <>
              <Link href="/library">My library</Link>
              <Link href="/dashboard">Creator dashboard</Link>
              {isAdmin ? <Link href="/admin">Admin</Link> : null}
              <form action={signOut}>
                <button className="link-btn" type="submit">
                  Log out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login">Log in</Link>
              <Link href="/login?mode=signup" className="btn btn-sm">
                Get started
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
