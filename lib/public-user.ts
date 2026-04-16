import 'server-only'

import type { User } from '@supabase/supabase-js'

import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import type { CoLabUser } from '@/lib/supabase'

function isUsersEmailConflictError(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? ''

  return (
    message.includes('users_email_key') ||
    (message.includes('duplicate key value') && message.includes('email'))
  )
}

async function findConflictingPublicUserId(email: string, currentUserId: string) {
  const supabase = getSupabaseAdminClient()
  const normalizedEmail = email.trim().toLowerCase()

  const { data: conflictingUser, error } = await supabase
    .from('users')
    .select('id')
    .ilike('email', normalizedEmail)
    .neq('id', currentUserId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return conflictingUser?.id ?? null
}

export async function ensurePublicUserForAuthUser(authUser: User) {
  const supabase = getSupabaseAdminClient()
  const normalizedEmail = authUser.email?.trim().toLowerCase() ?? null

  const { data: existingUser, error: existingUserError } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle()

  if (existingUserError) {
    throw new Error(existingUserError.message)
  }

  if (existingUser) {
    if (normalizedEmail && existingUser.email !== normalizedEmail) {
      const conflictingUserId = await findConflictingPublicUserId(
        normalizedEmail,
        authUser.id
      )

      if (conflictingUserId) {
        return existingUser as CoLabUser
      }

      const { data: syncedUser, error: syncError } = await supabase
        .from('users')
        .update({
          email: normalizedEmail,
        })
        .eq('id', authUser.id)
        .select('*')
        .single()

      if (syncError || !syncedUser) {
        throw new Error(syncError?.message ?? 'Failed to sync public user email.')
      }

      return syncedUser as CoLabUser
    }

    return existingUser as CoLabUser
  }

  if (normalizedEmail) {
    const conflictingUserId = await findConflictingPublicUserId(
      normalizedEmail,
      authUser.id
    )

    if (conflictingUserId) {
      const { data: insertedUser, error: insertWithoutEmailError } = await supabase
        .from('users')
        .upsert(
          {
            id: authUser.id,
            email: null,
          },
          {
            onConflict: 'id',
          }
        )
        .select('*')
        .single()

      if (insertWithoutEmailError || !insertedUser) {
        throw new Error(
          insertWithoutEmailError?.message ??
            'Failed to create public user profile.'
        )
      }

      return insertedUser as CoLabUser
    }
  }

  const { data: insertedUser, error: insertError } = await supabase
    .from('users')
    .upsert(
      {
        id: authUser.id,
        email: normalizedEmail,
      },
      {
        onConflict: 'id',
      }
    )
    .select('*')
    .single()

  if (isUsersEmailConflictError(insertError)) {
    const { data: fallbackUser, error: fallbackError } = await supabase
      .from('users')
      .upsert(
        {
          id: authUser.id,
          email: null,
        },
        {
          onConflict: 'id',
        }
      )
      .select('*')
      .single()

    if (fallbackError || !fallbackUser) {
      throw new Error(
        fallbackError?.message ?? 'Failed to create public user profile.'
      )
    }

    return fallbackUser as CoLabUser
  }

  if (insertError || !insertedUser) {
    throw new Error(insertError?.message ?? 'Failed to create public user profile.')
  }

  return insertedUser as CoLabUser
}
