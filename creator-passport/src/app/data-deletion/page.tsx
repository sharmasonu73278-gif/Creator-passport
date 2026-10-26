import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { first, type SearchParams } from "@/lib/params";

export const metadata = { title: "Data deletion" };
export const dynamic = "force-dynamic";

// Status page for Meta's data deletion callback, and instructions for people who want their data removed.
export default async function DataDeletion({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const code = (first(sp.code) ?? "").trim();

  let status: string | null = null;
  if (/^[a-f0-9]{8,32}$/.test(code)) {
    const { data } = await createAdminClient().from("deletion_requests").select("status,created_at").eq("code", code).maybeSingle();
    status = data ? `${data.status} on ${new Date(data.created_at).toUTCString()}` : "not found";
  }

  return (
    <div className="prose" style={{ maxWidth: 760 }}>
      <h1>Delete your Instagram data</h1>

      {code ? (
        <div className="card">
          <p style={{ marginBottom: 0 }}>
            Request <code>{code}</code>: <strong>{status}</strong>.
          </p>
        </div>
      ) : null}

      <h2>Ways to delete</h2>
      <ul>
        <li>
          Log in and press <strong>Disconnect</strong> in the Instagram box on your{" "}
          <Link href="/dashboard">creator dashboard</Link>. This deletes your Instagram token, your reel list and the Instagram
          link on your profile immediately.
        </li>
        <li>
          Or remove "Resource Passport" in Instagram, under Settings, Apps and websites. Instagram then tells us, and we delete the
          same data automatically.
        </li>
        <li>To delete your whole account and everything you posted, email [contact email] from your account's address.</li>
      </ul>
    </div>
  );
}
