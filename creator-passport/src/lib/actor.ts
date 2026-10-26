import { headers } from "next/headers";
import { sha256Hex } from "@/lib/crypto";

/**
 * A privacy-friendly "who is this" fingerprint used to count unique people.
 * Signed-in users get a stable hash. Anonymous visitors get a hash of IP + browser that
 * changes every day, so we can de-duplicate without keeping a long-term tracking profile.
 */
export async function actorHash(userId?: string | null): Promise<string> {
  const salt = process.env.ACTOR_SALT || process.env.TOKEN_ENCRYPTION_KEY || "dev-salt";
  if (userId) return sha256Hex(`u:${userId}:${salt}`);

  const h = await headers();
  const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  const ua = h.get("user-agent") || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  return sha256Hex(`a:${ip}:${ua}:${day}:${salt}`);
}
