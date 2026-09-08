import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

/**
 * Creates a Supabase client that exists only on the API server.
 * The browser never receives the Supabase URL/key from this module.
 */
export function createSupabaseClient() {
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
