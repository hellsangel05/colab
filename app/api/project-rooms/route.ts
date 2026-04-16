import { NextRequest, NextResponse } from 'next/server'

import { VALIDATION } from '@/lib/config'
import { ensurePublicUserForAuthUser } from '@/lib/public-user'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type CreateProjectRoomBody = {
  originNodeId?: string
  title?: string
  direction?: string | null
  openingQuestion?: string | null
  rolesNeeded?: string[]
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser(request)
    await ensurePublicUserForAuthUser(user)
    const body = (await request.json()) as CreateProjectRoomBody
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const direction =
      typeof body.direction === 'string' ? body.direction.trim() : ''
    const openingQuestion =
      typeof body.openingQuestion === 'string'
        ? body.openingQuestion.trim()
        : ''
    const rolesNeeded = Array.isArray(body.rolesNeeded)
      ? body.rolesNeeded.filter((role): role is string => typeof role === 'string')
      : []

    if (!body.originNodeId) {
      return NextResponse.json({ error: 'Origin node is required.' }, { status: 400 })
    }

    if (!title || title.length > VALIDATION.maxRoomTitleLength) {
      return NextResponse.json(
        {
          error: `Title must be between 1 and ${VALIDATION.maxRoomTitleLength} characters.`,
        },
        { status: 400 }
      )
    }

    if (direction.length > VALIDATION.maxRoomDirectionLength) {
      return NextResponse.json(
        {
          error: `Direction must be at most ${VALIDATION.maxRoomDirectionLength} characters.`,
        },
        { status: 400 }
      )
    }

    if (openingQuestion.length > VALIDATION.maxOpeningQuestionLength) {
      return NextResponse.json(
        {
          error: `Opening question must be at most ${VALIDATION.maxOpeningQuestionLength} characters.`,
        },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdminClient()
    const { data: originNode } = await supabase
      .from('nodes')
      .select('id')
      .eq('id', body.originNodeId)
      .single()

    if (!originNode) {
      return NextResponse.json({ error: 'Origin node not found.' }, { status: 404 })
    }

    const now = new Date().toISOString()
    const { data: room, error } = await supabase
      .from('project_rooms')
      .insert({
        origin_node_id: originNode.id,
        opened_by: user.id,
        title,
        direction: direction || null,
        opening_question: openingQuestion || null,
        roles_needed: rolesNeeded,
        status: 'open',
        contributor_ids: [user.id],
        build_log: [],
        last_active_at: now,
      })
      .select('*')
      .single()

    if (error || !room) {
      return NextResponse.json(
        { error: error?.message ?? 'Failed to create room.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ room })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unauthorized.' },
      { status: 401 }
    )
  }
}
