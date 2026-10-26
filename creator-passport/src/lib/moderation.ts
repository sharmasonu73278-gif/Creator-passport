import { createAdminClient } from "@/lib/supabase/admin";
import {
  REJECT_HOSTS,
  REJECT_STRIPPED,
  REJECT_WORDS,
  REVIEW_HOSTS,
  REVIEW_PHRASES,
} from "@/lib/blocklist";

export type Verdict = {
  status: "approved" | "pending" | "rejected";
  /** Internal note shown to admins. */
  note?: string;
  /** Safe message to show the person who wrote the content. Never repeats the offending word. */
  message?: string;
};

const OK: Verdict = { status: "approved" };

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ​-‏⁠﻿]/g, "")
    .replace(/[01345 7@$]/g, (c) => LEET[c] ?? c);
}

function tokens(text: string): string[] {
  return normalize(text).split(/[^a-z]+/).filter(Boolean);
}

const rejectSet = new Set(REJECT_WORDS);

export function worst(...verdicts: Verdict[]): Verdict {
  const rank = { approved: 0, pending: 1, rejected: 2 } as const;
  return verdicts.reduce((a, b) => (rank[b.status] > rank[a.status] ? b : a), OK);
}

/** Checks any number of text fields. Rejects vulgar or abusive language, holds risky topics for review. */
export function checkText(...texts: (string | null | undefined)[]): Verdict {
  const text = texts.filter(Boolean).join(" \n ");
  if (!text.trim()) return OK;

  const norm = normalize(text);
  const words = tokens(text);

  for (const w of words) {
    const variants = [w, w.replace(/(.)\1{2,}/g, "$1"), w.replace(/(.)\1{2,}/g, "$1$1")];
    if (variants.some((v) => rejectSet.has(v))) {
      return {
        status: "rejected",
        note: "Blocked word",
        message: "That text contains language that isn't allowed here. Please reword it.",
      };
    }
  }

  const stripped = norm.replace(/[^a-z]/g, "");
  if (REJECT_STRIPPED.some((t) => stripped.includes(t))) {
    return {
      status: "rejected",
      note: "Blocked term (obfuscated)",
      message: "That text contains language that isn't allowed here. Please reword it.",
    };
  }

  const padded = ` ${norm.replace(/[^a-z0-9+]+/g, " ").trim()} `;
  for (const phrase of REVIEW_PHRASES) {
    const p = ` ${phrase.replace(/[^a-z0-9+ ]+/g, " ").trim()} `;
    if (padded.includes(p)) {
      return { status: "pending", note: `Needs review: matches "${phrase}"` };
    }
  }

  return OK;
}

function hostMatches(host: string, list: string[]): boolean {
  return list.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Checks a link: allowed hosts, look-alike domains, URL shorteners and (optionally) Google Web Risk. */
export async function checkUrl(url: string): Promise<Verdict> {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return { status: "rejected", message: "That link isn't valid." };
  }

  if (hostMatches(host, REJECT_HOSTS) || /(porn|xxx|hentai|nsfw)/.test(host)) {
    return {
      status: "rejected",
      note: "Blocked host",
      message: "Links to that kind of site aren't allowed.",
    };
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
    return { status: "pending", note: "Link points to a raw IP address" };
  }
  if (host.split(".").some((part) => part.startsWith("xn--"))) {
    return { status: "pending", note: "Link uses an internationalised (look-alike) domain" };
  }
  if (hostMatches(host, REVIEW_HOSTS)) {
    return { status: "pending", note: "Shortened or piracy-associated link" };
  }

  const key = process.env.GOOGLE_WEB_RISK_API_KEY;
  if (key) {
    try {
      const u = new URL("https://webrisk.googleapis.com/v1/uris:search");
      for (const t of ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"]) u.searchParams.append("threatTypes", t);
      u.searchParams.set("uri", url);
      u.searchParams.set("key", key);
      const res = await fetch(u.toString(), { signal: AbortSignal.timeout(6000), cache: "no-store" });
      if (!res.ok) return { status: "pending", note: "Could not check link safety (service error)" };
      const json = (await res.json()) as { threat?: { threatTypes?: string[] } };
      if (json.threat?.threatTypes?.length) {
        return {
          status: "rejected",
          note: `Flagged by Google Web Risk: ${json.threat.threatTypes.join(", ")}`,
          message: "That link was flagged as unsafe, so it can't be added.",
        };
      }
    } catch {
      return { status: "pending", note: "Could not check link safety (timeout)" };
    }
  }

  return OK;
}

/** Full check for a resource before it is allowed to appear publicly. */
export async function moderateResource(input: {
  title: string;
  description: string | null;
  url: string;
}): Promise<Verdict> {
  const text = checkText(input.title, input.description);
  if (text.status === "rejected") return text;
  const link = await checkUrl(input.url);
  if (link.status === "rejected") return link;
  return worst(text, link);
}

/**
 * Records the outcome on a row. Only the server can do this (service role), because users
 * are not allowed to write moderation columns themselves.
 */
export async function setModeration(table: "collections" | "resources", id: string, v: Verdict) {
  const admin = createAdminClient();
  await admin
    .from(table)
    .update({ moderation_status: v.status, moderation_note: v.note ?? null })
    .eq("id", id);
}
