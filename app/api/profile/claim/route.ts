import { NextRequest, NextResponse } from 'next/server'

import { VALIDATION } from '@/lib/config'
import { ensurePublicUserForAuthUser } from '@/lib/public-user'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type ClaimProfileBody = {
  username?: string
  email?: string
}

function normalizeClaimErrorMessage(message: string) {
  const lower = message.toLowerCase()

  if (
    lower.includes('already') ||
    lower.includes('users_email_key') ||
    (lower.includes('duplicate key value') && lower.includes('email'))
  ) {
    return 'That email is already claimed by another account.'
  }

  return message
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser(request)
    const body = (await request.json()) as ClaimProfileBody
    const username =
      typeof body.username === 'string' ? body.username.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

    if (!username || username.length > VALIDATION.maxUsernameLength) {
      return NextResponse.json(
        {
          error: `Username must be between 1 and ${VALIDATION.maxUsernameLength} characters.`,
        },
        { status: 400 }
      )
    }

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
    }

    const supabase = getSupabaseAdminClient()
    await ensurePublicUserForAuthUser(user)

    const { data: conflictingPublicUser, error: conflictingPublicUserError } = await supabase
      .from('users')
      .select('id')
      .ilike('email', email)
      .neq('id', user.id)
      .maybeSingle()

    if (conflictingPublicUserError) {
      return NextResponse.json(
        { error: conflictingPublicUserError.message },
        { status: 500 }
      )
    }

    if (conflictingPublicUser) {
      return NextResponse.json(
        { error: 'That email is already claimed by another account.' },
        { status: 409 }
      )
    }

    const { error: authError } = await supabase.auth.admin.updateUserById(user.id, {
      email,
      user_metadata: {
        username,
      },
    })

    if (authError) {
      const message = normalizeClaimErrorMessage(authError.message)

      return NextResponse.json({ error: message }, { status: 400 })
    }

    const { data: claimedUser, error: updateError } = await supabase
      .from('users')
      .update({
        username,
        email,
      })
      .eq('id', user.id)
      .select('*')
      .single()

    if (updateError || !claimedUser) {
      return NextResponse.json(
        {
          error: normalizeClaimErrorMessage(
            updateError?.message ?? 'Failed to claim profile.'
          ),
        },
        {
          status:
            updateError?.message
              ? normalizeClaimErrorMessage(updateError.message) ===
                'That email is already claimed by another account.'
                ? 409
                : 500
              : 500,
        }
      )
    }

    return NextResponse.json({
      user: claimedUser,
      needsEmailVerification: false,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unauthorized.' },
      { status: 401 }
    )
  }
}
