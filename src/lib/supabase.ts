import { createClient } from "@supabase/supabase-js";

let cachedClient: ReturnType<typeof createClient<any>> | null = null;

function resolveSupabaseConfig() {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  return { supabaseUrl, supabaseKey };
}

export function getSupabaseClient() {
  if (cachedClient) {
    return cachedClient;
  }
  const { supabaseUrl, supabaseKey } = resolveSupabaseConfig();
  cachedClient = createClient<any>(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });
  return cachedClient;
}
