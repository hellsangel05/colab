import { NextRequest, NextResponse } from 'next/server'

import { APP_LIMITS, VALIDATION } from '@/lib/config'
import { ensurePublicUserForAuthUser } from '@/lib/public-user'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { isLabId } from '@/types'

type CreateNodeBody = {
  content?: string
  lab?: string
  promptId?: string | null
  parentNodeId?: string | null
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser(request)
    const body = (await request.json()) as CreateNodeBody
    const content = typeof body.content === 'string' ? body.content.trim() : ''

    if (!content) {
      return NextResponse.json({ error: 'Content is required.' }, { status: 400 })
    }

    if (
      content.length < VALIDATION.minNodeLength ||
      content.length > VALIDATION.maxNodeLength
    ) {
      return NextResponse.json(
        {
          error: `Content must be between ${VALIDATION.minNodeLength} and ${VALIDATION.maxNodeLength} characters.`,
        },
        { status: 400 }
      )
    }

    if (!body.lab || !isLabId(body.lab)) {
      return NextResponse.json({ error: 'Invalid lab.' }, { status: 400 })
    }

    const supabase = getSupabaseAdminClient()
    const publicUser = await ensurePublicUserForAuthUser(user)

    if (!publicUser.email) {
      const since = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString()
      const { count } = await supabase
        .from('nodes')
        .select('id', { count: 'exact', head: true })
        .eq('submitted_by', user.id)
        .gte('created_at', since)

      if ((count ?? 0) >= APP_LIMITS.anonymousSubmissionsPerDay) {
        return NextResponse.json(
          {
            error: `Anonymous users can create up to ${APP_LIMITS.anonymousSubmissionsPerDay} nodes every 24 hours.`,
          },
          { status: 429 }
        )
      }
    }

    let promptId: string | null = null
    if (body.promptId) {
      const { data: prompt } = await supabase
        .from('prompts')
        .select('id, response_count, engagement_score')
        .eq('id', body.promptId)
        .single()

      if (!prompt) {
        return NextResponse.json({ error: 'Prompt not found.' }, { status: 404 })
      }

      promptId = prompt.id
    }

    let parentNodeId: string | null = null
    let roomIds: string[] = []
    if (body.parentNodeId) {
      const { data: parentNode } = await supabase
        .from('nodes')
        .select('id')
        .eq('id', body.parentNodeId)
        .single()

      if (!parentNode) {
        return NextResponse.json({ error: 'Parent node not found.' }, { status: 404 })
      }

      parentNodeId = parentNode.id

      const { data: rooms } = await supabase
        .from('project_rooms')
        .select('id')
        .eq('origin_node_id', parentNode.id)

      roomIds = (rooms ?? []).map((room) => room.id)
    }

    const nodeType = roomIds.length > 0
      ? 'room_contribution'
      : parentNodeId
        ? 'reply'
        : promptId
          ? 'prompt_response'
          : 'concept'

    const now = new Date().toISOString()

    const { data: node, error: insertError } = await supabase
      .from('nodes')
      .insert({
        content,
        lab: body.lab,
        origin: 'human',
        submitted_by: user.id,
        node_type: nodeType,
        status: 'active',
        moderation_status: 'visible',
        vote_count: 0,
        is_seed: false,
        parent_node_id: parentNodeId,
        prompt_id: promptId,
        last_active_at: now,
      })
      .select('*')
      .single()

    if (insertError || !node) {
      return NextResponse.json(
        { error: insertError?.message ?? 'Failed to create node.' },
        { status: 500 }
      )
    }

    if (promptId) {
      const { data: prompt } = await supabase
        .from('prompts')
        .select('response_count, engagement_score')
        .eq('id', promptId)
        .single()

      if (prompt) {
        await supabase
          .from('prompts')
          .update({
            response_count: prompt.response_count + 1,
            engagement_score: prompt.engagement_score + 1,
            open_text_ratio: 1,
          })
          .eq('id', promptId)
      }
    }

    if (parentNodeId) {
      await supabase
        .from('nodes')
        .update({ last_active_at: now })
        .eq('id', parentNodeId)
    }

    for (const roomId of roomIds) {
      const { data: room } = await supabase
        .from('project_rooms')
        .select('id, contributor_ids')
        .eq('id', roomId)
        .single()

      if (!room) {
        continue
      }

      const contributorIds = room.contributor_ids.includes(user.id)
        ? room.contributor_ids
        : [...room.contributor_ids, user.id]

      await supabase
        .from('project_rooms')
        .update({
          contributor_ids: contributorIds,
          last_active_at: now,
        })
        .eq('id', room.id)
    }

    return NextResponse.json({ node })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unauthorized.' },
      { status: 401 }
    )
  }
}
