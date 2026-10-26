"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkText, moderateResource, setModeration } from "@/lib/moderation";
import { MAX_PDF_BYTES, inspectPdf, safeFileName } from "@/lib/pdf";
import { removeInstagramData, syncInstagram } from "@/lib/instagram-sync";
import { limitMessage, saveUsage } from "@/lib/limits";
import {
  CATEGORIES,
  KINDS,
  PRICING,
  REPORT_REASONS,
  isValidHandle,
  normalizeUrl,
  safePath,
  slugify,
  str,
  withParam,
} from "@/lib/utils";

function enc(msg: string) {
  return encodeURIComponent(msg);
}

/** Turns database error codes into messages a person can act on. */
function friendly(message: string): string {
  if (message.includes("REEL_REQUIRED")) return "Pick one of your own Instagram reels before publishing.";
  if (message.includes("REEL_NOT_OWNED")) return "That reel isn't on your connected Instagram account.";
  if (message.includes("RESOURCE_LIMIT")) return "A collection can hold up to 30 resources.";
  if (message.includes("INVALID_GUIDE_PATH")) return "That guide file isn't valid.";
  return message;
}

/** Signed-in user who is allowed to publish (not banned). */
async function creatorUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("is_banned").eq("id", user.id).maybeSingle();
  if (me?.is_banned) redirect(`/?error=${enc("This account has been suspended.")}`);
  return { supabase, user };
}

/** Any signed-in user. Sends visitors to log in and then back to where they were. */
async function plainUser(returnTo: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${enc(safePath(returnTo, "/"))}`);
  return { supabase, user };
}

/* ------------------------------------------------------------------ auth */

export async function signIn(formData: FormData) {
  const email = str(formData, "email");
  const password = str(formData, "password");
  const next = safePath(str(formData, "next") || "/dashboard");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${enc(error.message)}&next=${enc(next)}`);
  redirect(next);
}

export async function signUp(formData: FormData) {
  const email = str(formData, "email");
  const password = str(formData, "password");
  const next = safePath(str(formData, "next") || "/dashboard");

  if (password.length < 8) {
    redirect(`/login?mode=signup&error=${enc("Password must be at least 8 characters.")}`);
  }

  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: origin ? { emailRedirectTo: `${origin}/auth/callback?next=${enc(next)}` } : undefined,
  });
  if (error) redirect(`/login?mode=signup&error=${enc(error.message)}`);

  // When email confirmation is on in Supabase there is no session yet.
  if (!data.session) {
    redirect(`/login?message=${enc("Check your email to confirm your account, then log in.")}`);
  }
  redirect(next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

/* --------------------------------------------------------------- profile */

export async function updateProfile(formData: FormData) {
  const { supabase, user } = await creatorUser();

  const { data: me } = await supabase.from("profiles").select("instagram_user_id").eq("id", user.id).maybeSingle();
  const connected = Boolean(me?.instagram_user_id);

  const handle = str(formData, "handle").toLowerCase();
  if (!isValidHandle(handle)) {
    redirect(
      `/dashboard/profile?error=${enc("Handle must be 3-30 characters: lowercase letters, numbers, underscore.")}`
    );
  }

  const bio = str(formData, "bio").slice(0, 400);
  const update: Record<string, unknown> = {
    handle,
    bio: bio || null,
    youtube_url: normalizeUrl(str(formData, "youtube_url")),
    website_url: normalizeUrl(str(formData, "website_url")),
  };

  // When Instagram is connected, name, picture and Instagram link come from Instagram and can't be edited here.
  let displayName = "";
  if (!connected) {
    displayName = str(formData, "display_name").slice(0, 80);
    update.display_name = displayName || null;
    update.avatar_url = normalizeUrl(str(formData, "avatar_url"));
    update.instagram_url = normalizeUrl(str(formData, "instagram_url"));
  }

  const verdict = checkText(handle.replace(/_/g, " "), bio, displayName);
  if (verdict.status !== "approved") {
    redirect(
      `/dashboard/profile?error=${enc(verdict.message ?? "Please reword your profile text and try again.")}`
    );
  }

  // Profiles are written by the server only, so people can't edit their own role, plan or Instagram link.
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update(update).eq("id", user.id);
  if (error) {
    const msg = error.code === "23505" ? "That handle is already taken." : error.message;
    redirect(`/dashboard/profile?error=${enc(msg)}`);
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard/profile?message=${enc("Profile saved.")}`);
}

/* ------------------------------------------------------------- Instagram */

export async function syncInstagramAction() {
  const { user } = await creatorUser();
  let key: "message" | "error" = "message";
  let text = "";
  try {
    const r = await syncInstagram(user.id);
    text = `Synced @${r.username}. ${r.reels} reels available.`;
  } catch (e) {
    key = "error";
    text = e instanceof Error ? e.message : "Could not sync Instagram.";
  }
  revalidatePath("/dashboard");
  redirect(`/dashboard?${key}=${enc(text)}`);
}

export async function disconnectInstagram() {
  const { user } = await creatorUser();
  await removeInstagramData(user.id);
  revalidatePath("/dashboard");
  redirect(
    `/dashboard?message=${enc("Instagram disconnected. Your collections were taken offline because they need a verified reel.")}`
  );
}

/* ----------------------------------------------------------- collections */

export async function createCollection(formData: FormData) {
  const { supabase, user } = await creatorUser();

  const reelId = str(formData, "ig_media_id");
  if (!reelId) redirect(`/dashboard/collections/new?error=${enc("Choose one of your Instagram reels.")}`);

  // The reel must belong to this creator's connected account (row level security + a database trigger check this too).
  const { data: reel } = await supabase
    .from("instagram_reels")
    .select("ig_media_id,caption")
    .eq("ig_media_id", reelId)
    .eq("creator_id", user.id)
    .maybeSingle();
  if (!reel) redirect(`/dashboard/collections/new?error=${enc("That reel isn't on your connected Instagram account.")}`);

  const { data: taken } = await supabase.from("collections").select("id").eq("ig_media_id", reelId).maybeSingle();
  if (taken) redirect(`/dashboard/collections/${taken.id}?message=${enc("This reel already has a collection.")}`);

  const captionLine = String(reel.caption ?? "").split("\n")[0].trim();
  const title = (str(formData, "title") || captionLine).slice(0, 140) || "Untitled collection";
  const description = str(formData, "description").slice(0, 600);
  const category = str(formData, "category");

  const verdict = checkText(title, description);
  if (verdict.status === "rejected") {
    redirect(`/dashboard/collections/new?error=${enc(verdict.message ?? "Please reword that text.")}`);
  }

  const base = slugify(title);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await supabase
      .from("collections")
      .insert({
        creator_id: user.id,
        title,
        slug,
        description: description || null,
        category: (CATEGORIES as readonly string[]).includes(category) ? category : null,
        ig_media_id: reelId,
      })
      .select("id")
      .single();

    if (!error && data) {
      await setModeration("collections", data.id, verdict);
      redirect(`/dashboard/collections/${data.id}`);
    }
    if (error && error.code !== "23505") {
      redirect(`/dashboard/collections/new?error=${enc(friendly(error.message))}`);
    }
  }
  redirect(`/dashboard/collections/new?error=${enc("Could not create a unique link. Try another title.")}`);
}

export async function updateCollection(id: string, formData: FormData) {
  const { supabase } = await creatorUser();
  const category = str(formData, "category");
  const title = str(formData, "title").slice(0, 140);
  const description = str(formData, "description").slice(0, 600);
  if (!title) redirect(`/dashboard/collections/${id}?error=${enc("Title is required.")}`);

  const verdict = checkText(title, description);
  if (verdict.status === "rejected") {
    redirect(`/dashboard/collections/${id}?error=${enc(verdict.message ?? "Please reword that text.")}`);
  }

  const { error } = await supabase
    .from("collections")
    .update({
      title,
      description: description || null,
      category: (CATEGORIES as readonly string[]).includes(category) ? category : null,
    })
    .eq("id", id);
  if (error) redirect(`/dashboard/collections/${id}?error=${enc(friendly(error.message))}`);

  await setModeration("collections", id, verdict);
  revalidatePath(`/dashboard/collections/${id}`);
  redirect(`/dashboard/collections/${id}?message=${enc("Collection saved.")}`);
}

export async function setPublished(id: string, publish: boolean) {
  const { supabase } = await creatorUser();
  const { error } = await supabase.from("collections").update({ is_published: publish }).eq("id", id);
  if (error) redirect(`/dashboard/collections/${id}?error=${enc(friendly(error.message))}`);

  const { data: c } = await supabase.from("collections").select("moderation_status").eq("id", id).maybeSingle();
  let msg = "Unpublished. Your page is now hidden.";
  if (publish) {
    msg =
      c?.moderation_status === "approved"
        ? "Published. Your page is live."
        : "Submitted. Your page will go live once it passes review.";
  }
  revalidatePath(`/dashboard/collections/${id}`);
  redirect(`/dashboard/collections/${id}?message=${enc(msg)}`);
}

export async function deleteCollection(id: string) {
  const { supabase } = await creatorUser();

  const { data: files } = await supabase.from("resources").select("guide_path").eq("collection_id", id);
  const paths = ((files ?? []) as { guide_path: string | null }[]).map((f) => f.guide_path).filter((p): p is string => Boolean(p));
  if (paths.length > 0) await supabase.storage.from("guides").remove(paths);

  const { error } = await supabase.from("collections").delete().eq("id", id);
  if (error) redirect(`/dashboard/collections/${id}?error=${enc(friendly(error.message))}`);
  revalidatePath("/dashboard");
  redirect(`/dashboard?message=${enc("Collection deleted.")}`);
}

/* ------------------------------------------------------------- resources */

function readResource(formData: FormData) {
  const kind = str(formData, "kind");
  const pricing = str(formData, "pricing");
  return {
    title: str(formData, "title").slice(0, 140),
    url: normalizeUrl(str(formData, "url")),
    description: str(formData, "description").slice(0, 400) || null,
    kind: (KINDS as readonly string[]).includes(kind) ? kind : "website",
    pricing: (PRICING as readonly string[]).includes(pricing) ? pricing : "free",
  };
}

/**
 * Handles the optional PDF guide on the resource form: remove, or upload and replace.
 * Returns an error message, or null when nothing went wrong.
 */
async function handleGuide(
  supabase: SupabaseClient,
  userId: string,
  resourceId: string,
  formData: FormData,
  existingPath: string | null
): Promise<string | null> {
  let current = existingPath;

  if (formData.get("remove_guide") === "on" && current) {
    await supabase.storage.from("guides").remove([current]);
    await supabase.from("resources").update({ guide_path: null, guide_name: null }).eq("id", resourceId);
    current = null;
  }

  const file = formData.get("guide");
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_PDF_BYTES) return "PDF is too large. The limit is 10 MB.";

  const buf = Buffer.from(await file.arrayBuffer());
  const problem = inspectPdf(buf);
  if (problem) return problem;

  const path = `${userId}/${resourceId}-${Date.now()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("guides")
    .upload(path, buf, { contentType: "application/pdf", upsert: false });
  if (uploadError) return "Could not upload the PDF. Please try again.";

  const { error: dbError } = await supabase
    .from("resources")
    .update({ guide_path: path, guide_name: safeFileName(file.name) })
    .eq("id", resourceId);
  if (dbError) {
    await supabase.storage.from("guides").remove([path]);
    return friendly(dbError.message);
  }

  if (current && current !== path) await supabase.storage.from("guides").remove([current]);

  // By default a new PDF waits for an admin. Set REQUIRE_PDF_REVIEW=false to auto-approve after the safety screen.
  if (process.env.REQUIRE_PDF_REVIEW === "false") {
    await createAdminClient().from("resources").update({ guide_approved: true }).eq("id", resourceId);
  }
  return null;
}

export async function addResource(collectionId: string, formData: FormData) {
  const { supabase, user } = await creatorUser();
  const r = readResource(formData);
  if (!r.title || !r.url) {
    redirect(
      `/dashboard/collections/${collectionId}?error=${enc("A resource needs a title and a valid http(s) link.")}`
    );
  }

  const verdict = await moderateResource({ title: r.title, description: r.description, url: r.url });
  if (verdict.status === "rejected") {
    redirect(`/dashboard/collections/${collectionId}?error=${enc(verdict.message ?? "That resource can't be added.")}`);
  }

  const { data: last } = await supabase
    .from("resources")
    .select("position")
    .eq("collection_id", collectionId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: created, error } = await supabase
    .from("resources")
    .insert({ collection_id: collectionId, ...r, position: (last?.position ?? -1) + 1 })
    .select("id")
    .single();
  if (error || !created) {
    redirect(`/dashboard/collections/${collectionId}?error=${enc(friendly(error?.message ?? "Could not add the resource."))}`);
  }

  await setModeration("resources", created.id, verdict);
  const guideError = await handleGuide(supabase, user.id, created.id, formData, null);

  revalidatePath(`/dashboard/collections/${collectionId}`);
  if (guideError) {
    redirect(`/dashboard/collections/${collectionId}?error=${enc(`Resource added, but the PDF was not saved: ${guideError}`)}`);
  }
  const note = verdict.status === "pending" ? " It will appear publicly after a quick review." : "";
  redirect(`/dashboard/collections/${collectionId}?message=${enc(`Resource added.${note}`)}`);
}

export async function updateResource(collectionId: string, resourceId: string, formData: FormData) {
  const { supabase, user } = await creatorUser();
  const r = readResource(formData);
  if (!r.title || !r.url) {
    redirect(
      `/dashboard/collections/${collectionId}?error=${enc("A resource needs a title and a valid http(s) link.")}`
    );
  }

  const verdict = await moderateResource({ title: r.title, description: r.description, url: r.url });
  if (verdict.status === "rejected") {
    redirect(`/dashboard/collections/${collectionId}?error=${enc(verdict.message ?? "That resource can't be saved.")}`);
  }

  const { data: existing } = await supabase.from("resources").select("guide_path").eq("id", resourceId).maybeSingle();

  const { error } = await supabase.from("resources").update(r).eq("id", resourceId);
  if (error) redirect(`/dashboard/collections/${collectionId}?error=${enc(friendly(error.message))}`);

  await setModeration("resources", resourceId, verdict);
  const guideError = await handleGuide(supabase, user.id, resourceId, formData, existing?.guide_path ?? null);

  revalidatePath(`/dashboard/collections/${collectionId}`);
  if (guideError) {
    redirect(`/dashboard/collections/${collectionId}?error=${enc(`Saved, but the PDF was not updated: ${guideError}`)}`);
  }
  redirect(`/dashboard/collections/${collectionId}?message=${enc("Resource updated.")}`);
}

export async function deleteResource(collectionId: string, resourceId: string) {
  const { supabase } = await creatorUser();

  const { data: existing } = await supabase.from("resources").select("guide_path").eq("id", resourceId).maybeSingle();
  if (existing?.guide_path) await supabase.storage.from("guides").remove([existing.guide_path]);

  const { error } = await supabase.from("resources").delete().eq("id", resourceId);
  if (error) redirect(`/dashboard/collections/${collectionId}?error=${enc(friendly(error.message))}`);

  revalidatePath(`/dashboard/collections/${collectionId}`);
  redirect(`/dashboard/collections/${collectionId}?message=${enc("Resource removed.")}`);
}

/* ----------------------------------------------------------------- saves */

export async function toggleSave(resourceId: string, returnTo: string, formData: FormData) {
  void formData;
  const target = safePath(returnTo, "/");
  const { supabase, user } = await plainUser(target);

  const { data: existing } = await supabase
    .from("saves")
    .select("resource_id")
    .eq("user_id", user.id)
    .eq("resource_id", resourceId)
    .maybeSingle();

  if (existing) {
    await supabase.from("saves").delete().eq("user_id", user.id).eq("resource_id", resourceId);
  } else {
    const { error } = await supabase.from("saves").insert({ user_id: user.id, resource_id: resourceId });
    if (error) {
      if (error.message.includes("SAVE_LIMIT_REACHED")) {
        const usage = await saveUsage(supabase, user.id);
        redirect(withParam(target, "error", limitMessage(usage.limit)));
      }
      redirect(withParam(target, "error", error.message));
    }
  }

  revalidatePath(target);
  redirect(target);
}

/** One tap to save every resource in a collection (used by the share-a-reel flow). */
export async function saveCollectionResources(collectionId: string, returnTo: string, formData: FormData) {
  void formData;
  const target = safePath(returnTo, "/");
  const { supabase, user } = await plainUser(target);

  const { data: rs } = await supabase
    .from("resources")
    .select("id")
    .eq("collection_id", collectionId)
    .order("position", { ascending: true });
  const ids = ((rs ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) redirect(withParam(target, "error", "There is nothing to save in this collection yet."));

  const { data: have } = await supabase.from("saves").select("resource_id").eq("user_id", user.id).in("resource_id", ids);
  const already = new Set(((have ?? []) as { resource_id: string }[]).map((s) => s.resource_id));

  let added = 0;
  let hitLimit = false;
  for (const id of ids) {
    if (already.has(id)) continue;
    const { error } = await supabase.from("saves").insert({ user_id: user.id, resource_id: id });
    if (error) {
      if (error.message.includes("SAVE_LIMIT_REACHED")) hitLimit = true;
      break;
    }
    added++;
  }

  revalidatePath("/library");
  if (hitLimit) {
    const usage = await saveUsage(supabase, user.id);
    redirect(withParam(target, "error", `Saved ${added}. ${limitMessage(usage.limit)}`));
  }
  const text = added === 0 ? "Everything here is already in your library." : `Saved ${added} resource${added === 1 ? "" : "s"} to your library.`;
  redirect(withParam(target, "message", text));
}

/* -------------------------------------------------------------- feedback */

export async function submitFeedback(resourceId: string, returnTo: string, formData: FormData) {
  const target = safePath(returnTo, "/library");
  const { supabase, user } = await plainUser(target);

  const rating = Number(str(formData, "rating"));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    redirect(withParam(target, "error", "Please pick a rating from 1 to 5."));
  }
  const workedRaw = str(formData, "worked");
  const worked = workedRaw === "yes" ? true : workedRaw === "no" ? false : null;
  const comment = str(formData, "comment").slice(0, 500);

  const verdict = checkText(comment);
  if (verdict.status === "rejected") {
    redirect(withParam(target, "error", verdict.message ?? "Please reword your comment."));
  }

  const { error } = await supabase.from("feedback").upsert(
    { user_id: user.id, resource_id: resourceId, rating, worked, comment: comment || null },
    { onConflict: "user_id,resource_id" }
  );
  if (error) redirect(withParam(target, "error", "You can only rate resources you have saved."));

  revalidatePath("/library");
  redirect(withParam(target, "message", "Thanks for your feedback. It helps other people and the creator."));
}

/* --------------------------------------------------------------- reports */

export async function reportResource(resourceId: string, returnTo: string, formData: FormData) {
  const target = safePath(returnTo, "/");
  const { supabase, user } = await plainUser(target);

  const reason = str(formData, "reason");
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) {
    redirect(withParam(target, "error", "Please choose a reason for the report."));
  }
  const details = str(formData, "details").slice(0, 500);

  const { error } = await supabase
    .from("reports")
    .insert({ reporter_id: user.id, resource_id: resourceId, reason, details: details || null });
  if (error) {
    const msg = error.code === "23505" ? "You already reported this resource. Thank you." : "Could not send the report.";
    redirect(withParam(target, "error", msg));
  }
  redirect(withParam(target, "message", "Thanks. Our team will review this resource."));
}
