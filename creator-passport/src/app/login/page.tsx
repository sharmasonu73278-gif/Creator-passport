import Link from "next/link";
import Flash from "@/components/Flash";
import { signIn, signUp } from "@/app/actions";
import { first, type SearchParams } from "@/lib/params";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const mode = first(sp.mode) === "signup" ? "signup" : "login";
  const next = first(sp.next) ?? "/dashboard";

  return (
    <div style={{ maxWidth: 420, margin: "1.5rem auto" }}>
      <div className="card">
        <h1 style={{ fontSize: "1.7rem" }}>{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
        <p className="muted small">
          {mode === "signup"
            ? "One account lets you save resources and publish your own collections."
            : "Log in to see your library and creator dashboard."}
        </p>

        <Flash error={first(sp.error)} message={first(sp.message)} />

        <form action={mode === "signup" ? signUp : signIn}>
          <input type="hidden" name="next" value={next} />
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
            {mode === "signup" ? <div className="hint">At least 8 characters.</div> : null}
          </div>
          <button type="submit" className="btn" style={{ width: "100%" }}>
            {mode === "signup" ? "Sign up" : "Log in"}
          </button>
        </form>

        <p className="small muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
          {mode === "signup" ? (
            <>
              Already have an account? <Link href="/login">Log in</Link>
            </>
          ) : (
            <>
              New here? <Link href="/login?mode=signup">Create an account</Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
