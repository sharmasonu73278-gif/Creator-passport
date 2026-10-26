import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt, encrypt } from "@/lib/crypto";
import { checkText } from "@/lib/moderation";
import {
  downloadAvatar,
  exchangeCode,
  fetchProfile,
  fetchReels,
  toLongLived,
  type IgProfile,
} from "@/lib/instagram";

/** Copies name, username and picture from Instagram onto the Passport profile. */
async function applyProfile(userId: string, ig: IgProfile) {
  const admin = createAdminClient();

  let avatarUrl: string | null = null;
  if (ig.pictureUrl) {
    const img = await downloadAvatar(ig.pictureUrl);
    if (img) {
      const path = `${userId}.${img.ext}`;
      const { error } = await admin.storage
        .from("avatars")
        .upload(path, img.data, { contentType: img.contentType, upsert: true });
      if (!error) {
        avatarUrl = `${admin.storage.from("avatars").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
      }
    }
  }

  // Use the Instagram display name unless it fails our content check; then fall back to the username.
  const wanted = ig.name?.trim() || ig.username;
  const displayName = checkText(wanted).status === "approved" ? wanted : ig.username;

  const update: Record<string, unknown> = {
    display_name: displayName.slice(0, 80),
    instagram_user_id: ig.userId,
    instagram_username: ig.username,
    instagram_url: `https://www.instagram.com/${ig.username}/`,
    instagram_connected_at: new Date().toISOString(),
  };
  if (avatarUrl) update.avatar_url = avatarUrl;

  const { error } = await admin.from("profiles").update(update).eq("id", userId);
  if (error) {
    if (error.code === "23505") {
      throw new Error("This Instagram account is already connected to another Passport account.");
    }
    throw new Error(error.message);
  }
}

async function storeReels(userId: string, token: string): Promise<number> {
  const admin = createAdminClient();
  const reels = await fetchReels(token);
  if (reels.length > 0) {
    const rows = reels.map((r) => ({
      ig_media_id: r.id,
      creator_id: userId,
      shortcode: r.shortcode,
      permalink: r.permalink,
      caption: r.caption,
      thumbnail_url: r.thumbnailUrl,
      posted_at: r.postedAt,
      synced_at: new Date().toISOString(),
    }));
    const { error } = await admin.from("instagram_reels").upsert(rows, { onConflict: "ig_media_id" });
    if (error) throw new Error(error.message);
  }
  return reels.length;
}

/** First-time connection after the user approved access on Instagram. */
export async function finishConnect(userId: string, code: string): Promise<{ username: string; reels: number }> {
  const admin = createAdminClient();

  const short = await exchangeCode(code);
  const long = await toLongLived(short.accessToken);
  const profile = await fetchProfile(long.accessToken);
  const igUserId = profile.userId || short.userId;

  // One Instagram account can only belong to one Passport account.
  const { data: other } = await admin
    .from("profiles")
    .select("id")
    .eq("instagram_user_id", igUserId)
    .neq("id", userId)
    .maybeSingle();
  if (other) throw new Error("This Instagram account is already connected to another Passport account.");

  profile.userId = igUserId;
  await applyProfile(userId, profile);

  const { error } = await admin.from("instagram_connections").upsert(
    {
      user_id: userId,
      ig_user_id: igUserId,
      username: profile.username,
      token_enc: encrypt(long.accessToken),
      token_expires_at: new Date(Date.now() + long.expiresIn * 1000).toISOString(),
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(error.message);

  const reels = await storeReels(userId, long.accessToken);
  return { username: profile.username, reels };
}

/** Re-reads profile and reels from Instagram for an already connected creator. */
export async function syncInstagram(userId: string): Promise<{ reels: number; username: string }> {
  const admin = createAdminClient();
  const { data: conn } = await admin
    .from("instagram_connections")
    .select("token_enc, token_expires_at, last_synced_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!conn) throw new Error("Instagram is not connected.");

  if (new Date(conn.token_expires_at).getTime() < Date.now()) {
    throw new Error("Your Instagram connection has expired. Please connect again.");
  }
  if (conn.last_synced_at && Date.now() - new Date(conn.last_synced_at).getTime() < 60_000) {
    throw new Error("You just synced. Please wait a minute and try again.");
  }

  const token = decrypt(conn.token_enc);
  let profile: IgProfile;
  try {
    profile = await fetchProfile(token);
  } catch (e) {
    const err = e as Error & { code?: number };
    if (err.code === 190) throw new Error("Instagram says this connection is no longer valid. Please connect again.");
    throw err;
  }

  await applyProfile(userId, profile);
  const reels = await storeReels(userId, token);
  await admin
    .from("instagram_connections")
    .update({ username: profile.username, last_synced_at: new Date().toISOString() })
    .eq("user_id", userId);

  return { reels, username: profile.username };
}

/**
 * Removes everything we hold from Instagram for a user: token, reels and the link on the profile.
 * Collections that depended on a verified reel are taken offline.
 */
export async function removeInstagramData(userId: string) {
  const admin = createAdminClient();
  await admin.from("collections").update({ is_published: false }).eq("creator_id", userId);
  await admin.from("instagram_reels").delete().eq("creator_id", userId);
  await admin.from("instagram_connections").delete().eq("user_id", userId);
  await admin
    .from("profiles")
    .update({
      instagram_user_id: null,
      instagram_username: null,
      instagram_connected_at: null,
    })
    .eq("id", userId);
}
