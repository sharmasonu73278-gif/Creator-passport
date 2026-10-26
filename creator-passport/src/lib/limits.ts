import type { SupabaseClient } from "@supabase/supabase-js";

/** How many resources a person has saved and how many their plan allows. */
export async function saveUsage(supabase: SupabaseClient, userId: string) {
  const [profileRes, countRes] = await Promise.all([
    supabase.from("profiles").select("plan").eq("id", userId).maybeSingle(),
    supabase.from("saves").select("resource_id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  const plan: string = profileRes.data?.plan ?? "free";
  const { data: planRow } = await supabase.from("plans").select("save_limit").eq("name", plan).maybeSingle();
  return {
    plan,
    used: countRes.count ?? 0,
    limit: (planRow?.save_limit as number | undefined) ?? 25,
  };
}

export function limitMessage(limit: number): string {
  return `You've reached your limit of ${limit} saved resources. Remove one from your library to make room. Plans with more saves are coming soon.`;
}
