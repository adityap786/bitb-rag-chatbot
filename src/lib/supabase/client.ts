import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let _adminClient: SupabaseClient | null = null
let _anonClient: SupabaseClient | null = null

/**
 * Returns a singleton Supabase client initialized with the service role key.
 * This client MUST only be used on trusted server-side code. Do NOT expose
 * `SUPABASE_SERVICE_ROLE_KEY` to browsers or client bundles.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (_adminClient) return _adminClient
  if (!SUPABASE_URL) throw new Error('SUPABASE_URL is not set')
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set; required for admin operations')
  _adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  return _adminClient
}

/**
 * Returns a singleton Supabase client initialized with the anon key.
 * Use this for non-privileged, client-like server operations that should
 * respect RLS and not bypass policies.
 */
export function getSupabaseClient(): SupabaseClient {
  if (_anonClient) return _anonClient
  if (!SUPABASE_URL) throw new Error('SUPABASE_URL is not set')
  if (!SUPABASE_ANON_KEY) throw new Error('SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) is not set')
  _anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  return _anonClient
}

export default getSupabaseAdmin
