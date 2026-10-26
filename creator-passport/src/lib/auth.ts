import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Returns the signed-in user, or sends the visitor to the login page. */
export async function requireUser(next = "/dashboard") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return { supabase, user };
}

/** Admin pages and actions. Anyone who is not an admin gets a plain 404. */
export async function requireAdmin() {
  const { supabase, user } = await requireUser("/admin");
  const { data: me } = await supabase.from("profiles").select("is_admin,is_banned").eq("id", user.id).maybeSingle();
  if (!me?.is_admin || me.is_banned) notFound();
  return { supabase, user };
}
