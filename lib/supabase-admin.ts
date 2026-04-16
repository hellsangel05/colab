import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { getServerEnv } from '@/lib/config'
import type { Database } from '@/types/database'

let adminClient:
  | ReturnType<typeof createClient<Database>>
  | null = null
let authClient:
  | ReturnType<typeof createClient<Database>>
  | null = null

export function getSupabaseAdminClient() {
  if (!adminClient) {
    const env = getServerEnv()
    adminClient = createClient<Database>(
      env.supabaseUrl,
      env.supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
  }

  return adminClient
}

export function getSupabaseAuthClient() {
  if (!authClient) {
    const env = getServerEnv()
    authClient = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }

  return authClient
}
