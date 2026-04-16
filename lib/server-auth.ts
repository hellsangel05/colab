import 'server-only'

import { NextRequest } from 'next/server'

import { getSupabaseAuthClient } from '@/lib/supabase-admin'

function getBearerToken(request: NextRequest) {
  const header = request.headers.get('authorization')

  if (!header || !header.startsWith('Bearer ')) {
    return null
  }

  return header.slice('Bearer '.length).trim()
}

export async function requireAuthenticatedUser(request: NextRequest) {
  const token = getBearerToken(request)
  if (!token) {
    throw new Error('Missing bearer token.')
  }

  const authClient = getSupabaseAuthClient()
  const { data, error } = await authClient.auth.getUser(token)

  if (error || !data.user) {
    throw new Error(error?.message ?? 'Invalid user session.')
  }

  return {
    token,
    user: data.user,
  }
}
