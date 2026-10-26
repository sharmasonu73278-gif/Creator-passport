import { createHmac, timingSafeEqual } from "node:crypto";

// Instagram API with Instagram Login. Works for Instagram professional accounts only
// (business or creator). Personal accounts cannot grant a token.
// Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login

const VERSION = process.env.INSTAGRAM_GRAPH_VERSION || "v26.0";
const GRAPH = `https://graph.instagram.com/${VERSION}`;

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function redirectUri(): string {
  return `${siteUrl()}/api/instagram/callback`;
}

export function instagramConfigured(): boolean {
  return Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET);
}

function config() {
  const id = process.env.INSTAGRAM_APP_ID;
  const secret = process.env.INSTAGRAM_APP_SECRET;
  if (!id || !secret) throw new Error("Instagram is not configured on this server yet.");
  return { id, secret };
}

async function getJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000), cache: "no-store" });
  let text = await res.text();
  // Instagram ids are 17 digits, which is more than a JavaScript number can hold exactly.
  // Turn them into strings before parsing so they are never rounded.
  text = text.replace(/("(?:user_id|id)"\s*:\s*)(\d{15,})/g, '$1"$2"');
  let json: any = {};
  try {
    json = JSON.parse(text);
  } catch {
    // leave empty; handled below
  }
  if (!res.ok || json?.error || json?.error_message) {
    const msg =
      json?.error?.message || json?.error_message || `Instagram request failed (${res.status}).`;
    const err = new Error(String(msg));
    (err as Error & { code?: number }).code = json?.error?.code;
    throw err;
  }
  return json;
}

export function buildAuthUrl(state: string): string {
  const { id } = config();
  const u = new URL("https://www.instagram.com/oauth/authorize");
  u.searchParams.set("client_id", id);
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "instagram_business_basic");
  u.searchParams.set("state", state);
  return u.toString();
}

export async function exchangeCode(code: string): Promise<{ accessToken: string; userId: string }> {
  const { id, secret } = config();
  const body = new URLSearchParams({
    client_id: id,
    client_secret: secret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri(),
    code: code.replace(/#_$/, ""),
  });
  const json = await getJson("https://api.instagram.com/oauth/access_token", { method: "POST", body });
  const tok = Array.isArray(json.data) ? json.data[0] : json;
  if (!tok?.access_token || !tok?.user_id) throw new Error("Instagram did not return an access token.");
  return { accessToken: String(tok.access_token), userId: String(tok.user_id) };
}

export async function toLongLived(shortToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const { secret } = config();
  const u = new URL("https://graph.instagram.com/access_token");
  u.searchParams.set("grant_type", "ig_exchange_token");
  u.searchParams.set("client_secret", secret);
  u.searchParams.set("access_token", shortToken);
  const json = await getJson(u.toString());
  return { accessToken: String(json.access_token), expiresIn: Number(json.expires_in) || 60 * 24 * 3600 };
}

export async function refreshToken(token: string): Promise<{ accessToken: string; expiresIn: number }> {
  const u = new URL("https://graph.instagram.com/refresh_access_token");
  u.searchParams.set("grant_type", "ig_refresh_token");
  u.searchParams.set("access_token", token);
  const json = await getJson(u.toString());
  return { accessToken: String(json.access_token), expiresIn: Number(json.expires_in) || 60 * 24 * 3600 };
}

export type IgProfile = {
  userId: string;
  username: string;
  name: string | null;
  pictureUrl: string | null;
  accountType: string | null;
};

export async function fetchProfile(token: string): Promise<IgProfile> {
  const u = new URL(`${GRAPH}/me`);
  u.searchParams.set("fields", "user_id,username,name,profile_picture_url,account_type");
  u.searchParams.set("access_token", token);
  const j = await getJson(u.toString());
  return {
    userId: String(j.user_id ?? j.id),
    username: String(j.username ?? ""),
    name: j.name ? String(j.name) : null,
    pictureUrl: j.profile_picture_url ? String(j.profile_picture_url) : null,
    accountType: j.account_type ? String(j.account_type) : null,
  };
}

export type IgReel = {
  id: string;
  shortcode: string;
  permalink: string;
  caption: string | null;
  thumbnailUrl: string | null;
  postedAt: string | null;
};

const SHORTCODE_IN_PERMALINK = /\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/;

/** Pulls an Instagram post code out of any text, such as a shared message or pasted link. */
export function extractInstagramShortcode(text: string): string | null {
  const m = text.match(
    /https?:\/\/(?:www\.)?instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/i
  );
  return m ? m[1] : null;
}

/** The account's own reels, straight from Instagram. Up to ~150 most recent. */
export async function fetchReels(token: string): Promise<IgReel[]> {
  const first = new URL(`${GRAPH}/me/media`);
  first.searchParams.set("fields", "id,caption,media_type,permalink,thumbnail_url,timestamp");
  first.searchParams.set("limit", "50");
  first.searchParams.set("access_token", token);

  const reels: IgReel[] = [];
  let next: string | null = first.toString();

  for (let page = 0; page < 3 && next; page++) {
    const json: any = await getJson(next);
    for (const m of (json.data ?? []) as any[]) {
      const permalink = String(m.permalink ?? "");
      const isReel = m.media_type === "VIDEO" && /\/reels?\//.test(permalink);
      const code = permalink.match(SHORTCODE_IN_PERMALINK)?.[1];
      if (!isReel || !code) continue;
      reels.push({
        id: String(m.id),
        shortcode: code,
        permalink,
        caption: m.caption ? String(m.caption).slice(0, 2200) : null,
        thumbnailUrl: m.thumbnail_url ? String(m.thumbnail_url) : null,
        postedAt: m.timestamp ? String(m.timestamp) : null,
      });
    }
    const n: string | undefined = json.paging?.next;
    // Only follow paging links that stay on Instagram's own host.
    next = n && new URL(n).hostname === "graph.instagram.com" ? n : null;
  }
  return reels;
}

/** Downloads a profile picture from Instagram's CDN (the link expires, so we keep our own copy). */
export async function downloadAvatar(url: string): Promise<{ data: Buffer; contentType: string; ext: string } | null> {
  try {
    const u = new URL(url);
    const hostOk = u.protocol === "https:" && (/\.cdninstagram\.com$/.test(u.hostname) || /\.fbcdn\.net$/.test(u.hostname));
    if (!hostOk) return null;
    const res = await fetch(u.toString(), { signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") || "").split(";")[0].trim();
    const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : contentType === "image/jpeg" ? "jpg" : "";
    if (!ext) return null;
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length === 0 || data.length > 2 * 1024 * 1024) return null;
    return { data, contentType, ext };
  } catch {
    return null;
  }
}

/** Verifies and decodes the signed_request Meta sends to deauthorize / data-deletion callbacks. */
export function parseSignedRequest(signedRequest: string): { user_id?: string } | null {
  const { secret } = config();
  const [sigB64, payloadB64] = signedRequest.split(".");
  if (!sigB64 || !payloadB64) return null;
  const expected = createHmac("sha256", secret).update(payloadB64).digest();
  const given = Buffer.from(sigB64.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const raw = Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const fixed = raw.replace(/("user_id"\s*:\s*)(\d{15,})/g, '$1"$2"');
    return JSON.parse(fixed);
  } catch {
    return null;
  }
}
