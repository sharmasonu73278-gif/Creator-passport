"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { str } from "@/lib/utils";

function done(msg: string): never {
  revalidatePath("/admin");
  redirect(`/admin?message=${encodeURIComponent(msg)}`);
}

export async function approveItem(table: "collections" | "resources", id: string) {
  await requireAdmin();
  await createAdminClient().from(table).update({ moderation_status: "approved", moderation_note: null }).eq("id", id);
  done("Approved.");
}

export async function rejectItem(table: "collections" | "resources", id: string) {
  await requireAdmin();
  await createAdminClient()
    .from(table)
    .update({ moderation_status: "rejected", moderation_note: "Rejected by an admin" })
    .eq("id", id);
  done("Rejected. It will not be shown publicly.");
}

export async function approveGuide(resourceId: string) {
  await requireAdmin();
  await createAdminClient().from("resources").update({ guide_approved: true }).eq("id", resourceId);
  done("PDF guide approved.");
}

export async function rejectGuide(resourceId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { data } = await admin.from("resources").select("guide_path").eq("id", resourceId).maybeSingle();
  if (data?.guide_path) await admin.storage.from("guides").remove([data.guide_path]);
  await admin.from("resources").update({ guide_path: null, guide_name: null, guide_approved: false }).eq("id", resourceId);
  done("PDF guide removed.");
}

/** Upholding a report hides the resource and counts against the creator's ranking. */
export async function resolveReport(reportId: string, outcome: "upheld" | "dismissed") {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: report } = await admin.from("reports").select("resource_id").eq("id", reportId).maybeSingle();
  await admin.from("reports").update({ status: outcome }).eq("id", reportId);
  if (outcome === "upheld" && report?.resource_id) {
    await admin
      .from("resources")
      .update({ moderation_status: "rejected", moderation_note: "Removed after a report was upheld" })
      .eq("id", report.resource_id);
  }
  done(outcome === "upheld" ? "Report upheld. Resource removed." : "Report dismissed.");
}

export async function setBan(formData: FormData) {
  await requireAdmin();
  const handle = str(formData, "handle").toLowerCase().replace(/^@/, "");
  const ban = str(formData, "action") === "ban";
  if (!handle) done("Enter a handle.");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update({ is_banned: ban })
    .eq("handle", handle)
    .eq("is_admin", false)
    .select("id");
  if (error || !data || data.length === 0) done("No matching non-admin user found.");
  done(ban ? `@${handle} is banned. Their content is hidden.` : `@${handle} is no longer banned.`);
}
