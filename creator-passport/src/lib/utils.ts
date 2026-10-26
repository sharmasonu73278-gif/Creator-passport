export const CATEGORIES = [
  "AI",
  "Python",
  "Web Development",
  "Productivity",
  "Data Science",
  "Career",
  "Design",
  "Other",
] as const;

export const KINDS = ["github", "tool", "course", "template", "website", "other"] as const;
export const PRICING = ["free", "freemium", "paid"] as const;
export const REPORT_REASONS = ["vulgar", "scam", "malware", "copyright", "misleading", "other"] as const;

export type Kind = (typeof KINDS)[number];
export type Pricing = (typeof PRICING)[number];
export type ModerationStatus = "approved" | "pending" | "rejected";

export type Profile = {
  id: string;
  handle: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  instagram_url: string | null;
  youtube_url: string | null;
  website_url: string | null;
  instagram_user_id: string | null;
  instagram_username: string | null;
  is_admin: boolean;
  is_banned: boolean;
  plan: string;
};

export type Collection = {
  id: string;
  creator_id: string;
  title: string;
  slug: string;
  description: string | null;
  source_url: string | null;
  category: string | null;
  is_published: boolean;
  ig_media_id: string | null;
  ig_shortcode: string | null;
  ig_permalink: string | null;
  moderation_status: ModerationStatus;
  moderation_note: string | null;
  created_at: string;
  updated_at: string;
};

export type Resource = {
  id: string;
  collection_id: string;
  title: string;
  url: string;
  description: string | null;
  kind: Kind;
  pricing: Pricing;
  position: number;
  guide_path: string | null;
  guide_name: string | null;
  guide_approved: boolean;
  moderation_status: ModerationStatus;
  moderation_note: string | null;
};

/** Accepts only http(s) URLs. Returns null for anything else (blocks javascript:, data:, etc). */
export function normalizeUrl(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || "collection";
}

export function isValidHandle(h: string): boolean {
  return /^[a-z0-9_]{3,30}$/.test(h);
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/** Adds or replaces one query parameter on a same-site path like "/library?x=1". */
export function withParam(path: string, key: string, value: string): string {
  const u = new URL(path, "http://local");
  u.searchParams.set(key, value);
  return u.pathname + u.search;
}

/** Only allow same-site relative paths, to avoid open redirects. */
export function safePath(path: string, fallback = "/dashboard"): string {
  return path.startsWith("/") && !path.startsWith("//") ? path : fallback;
}
