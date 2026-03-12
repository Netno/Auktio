import { createClient } from "@supabase/supabase-js";

// ============================================
// Server client (uses service role, bypasses RLS)
// Used in API routes and cron jobs.
// All DB access goes through Next.js API routes — no direct
// browser-to-Supabase connection. Tables are locked via RLS;
// only the secret key (service role) can access them.
// ============================================
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: { persistSession: false },
    },
  );
}
