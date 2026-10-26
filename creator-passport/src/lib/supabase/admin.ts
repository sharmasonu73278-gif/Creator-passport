import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. It bypasses row level security, so it must only be used in server code
 * (server actions, route handlers), always after the caller has been identified and checked.
 * Never import this from a client component and never expose the key.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local (server only).");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
