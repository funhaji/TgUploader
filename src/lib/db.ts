import { getSupabaseClient } from "./supabase";

export type UploadType =
  | "text"
  | "link"
  | "document"
  | "photo"
  | "video"
  | "audio"
  | "voice"
  | "animation";

export type UploadRecord = {
  id: string;
  code: string;
  owner_id: number;
  type: UploadType;
  text_content: string | null;
  file_id: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  max_access: number | null;
  access_count: number;
  required_channels: string[] | null;
  created_at: string;
};

export type DraftRecord = {
  id: string;
  admin_id: number;
  code: string;
  max_access: number | null;
  required_channels: string[] | null;
  created_at: string;
};

export async function createDraft(
  adminId: number,
  code: string,
  maxAccess: number | null,
  requiredChannels: string[] | null
) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("drafts")
    .insert({
      admin_id: adminId,
      code,
      max_access: maxAccess,
      required_channels: requiredChannels
    })
    .select()
    .single();

  if (error) throw error;
  return data as DraftRecord;
}

export async function getLatestDraft(adminId: number) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("drafts")
    .select("*")
    .eq("admin_id", adminId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data as DraftRecord;
}

export async function deleteDraft(draftId: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("drafts").delete().eq("id", draftId);
  if (error) throw error;
}

export async function createUpload(payload: Omit<UploadRecord, "id" | "created_at" | "access_count">) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("uploads")
    .insert({
      ...payload,
      access_count: 0
    })
    .select()
    .single();

  if (error) throw error;
  return data as UploadRecord;
}

export async function getUploadByCode(code: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("uploads")
    .select("*")
    .eq("code", code)
    .single();

  if (error) return null;
  return data as UploadRecord;
}

export async function listUploads(ownerId: number, limit = 10) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("uploads")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data as UploadRecord[];
}

export async function deleteUploadByCode(ownerId: number, code: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("uploads")
    .delete()
    .eq("owner_id", ownerId)
    .eq("code", code)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export async function deleteAllUploads(ownerId: number) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("uploads")
    .delete()
    .eq("owner_id", ownerId)
    .select("id");

  if (error) throw error;
  return data?.length ?? 0;
}

export async function checkRateLimit(
  scope: string,
  userId: number,
  limit: number,
  windowSeconds: number
) {
  const supabase = getSupabaseClient();
  const now = new Date();
  const { data, error } = await supabase
    .from("rate_limits")
    .select("id, window_start, request_count")
    .eq("scope", scope)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const { error: insertError } = await supabase.from("rate_limits").insert({
      scope,
      user_id: userId,
      window_start: now.toISOString(),
      request_count: 1
    });
    if (insertError) throw insertError;
    return { allowed: true, remaining: Math.max(limit - 1, 0) };
  }

  const windowStart = new Date(data.window_start);
  const elapsedSeconds = (now.getTime() - windowStart.getTime()) / 1000;
  if (elapsedSeconds >= windowSeconds) {
    const { error: resetError } = await supabase
      .from("rate_limits")
      .update({
        window_start: now.toISOString(),
        request_count: 1
      })
      .eq("id", data.id);
    if (resetError) throw resetError;
    return { allowed: true, remaining: Math.max(limit - 1, 0) };
  }

  const nextCount = data.request_count + 1;
  if (nextCount > limit) {
    return { allowed: false, remaining: 0 };
  }

  const { error: updateError } = await supabase
    .from("rate_limits")
    .update({ request_count: nextCount })
    .eq("id", data.id);
  if (updateError) throw updateError;

  return { allowed: true, remaining: Math.max(limit - nextCount, 0) };
}

export async function registerAccess(upload: UploadRecord, userId: number) {
  const supabase = getSupabaseClient();
  const { data: existing } = await supabase
    .from("accesses")
    .select("id")
    .eq("upload_id", upload.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    return { alreadyAccessed: true, accessCount: upload.access_count };
  }

  const { error: insertError } = await supabase.from("accesses").insert({
    upload_id: upload.id,
    user_id: userId
  });
  if (insertError) throw insertError;

  const { data: updated, error: updateError } = await supabase
    .from("uploads")
    .update({ access_count: upload.access_count + 1 })
    .eq("id", upload.id)
    .select("access_count")
    .single();

  if (updateError) throw updateError;
  return { alreadyAccessed: false, accessCount: updated.access_count as number };
}
