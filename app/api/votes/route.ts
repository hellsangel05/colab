import { NextRequest, NextResponse } from 'next/server'

import { ensurePublicUserForAuthUser } from '@/lib/public-user'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type VoteBody = {
  targetId?: string
  targetType?: 'node' | 'edge' | 'prompt'
  value?: 1 | -1
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser(request)
    await ensurePublicUserForAuthUser(user)
    const body = (await request.json()) as VoteBody

    if (!body.targetId || !body.targetType || ![1, -1].includes(body.value ?? 0)) {
      return NextResponse.json({ error: 'Invalid vote payload.' }, { status: 400 })
    }

    const voteValue = body.value as 1 | -1

    const supabase = getSupabaseAdminClient()
    const { data: existingVote } = await supabase
      .from('votes')
      .select('id, value')
      .eq('target_id', body.targetId)
      .eq('target_type', body.targetType)
      .eq('voted_by', user.id)
      .maybeSingle()

    const previousValue = existingVote?.value ?? 0
    const delta = voteValue - previousValue

    if (delta === 0) {
      const currentValue = await getVoteAggregateValue(supabase, body.targetType, body.targetId)
      return NextResponse.json({ voteCount: currentValue })
    }

    const { error: voteError } = await supabase.from('votes').upsert(
      {
        target_id: body.targetId,
        target_type: body.targetType,
        voted_by: user.id,
        value: voteValue,
      },
      { onConflict: 'target_id,voted_by,target_type' }
    )

    if (voteError) {
      return NextResponse.json({ error: voteError.message }, { status: 500 })
    }

    const currentValue = await applyVoteAggregateDelta(
      supabase,
      body.targetType,
      body.targetId,
      delta
    )

    return NextResponse.json({ voteCount: currentValue })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unauthorized.' },
      { status: 401 }
    )
  }
}

async function getVoteAggregateValue(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  targetType: 'node' | 'edge' | 'prompt',
  targetId: string
) {
  if (targetType === 'node') {
    const { data } = await supabase
      .from('nodes')
      .select('vote_count')
      .eq('id', targetId)
      .single()

    return data?.vote_count ?? 0
  }

  if (targetType === 'edge') {
    const { data } = await supabase
      .from('edges')
      .select('vote_score')
      .eq('id', targetId)
      .single()

    return data?.vote_score ?? 0
  }

  const { data } = await supabase
    .from('prompts')
    .select('engagement_score')
    .eq('id', targetId)
    .single()

  return data?.engagement_score ?? 0
}

async function applyVoteAggregateDelta(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  targetType: 'node' | 'edge' | 'prompt',
  targetId: string,
  delta: number
) {
  if (targetType === 'node') {
    const { data } = await supabase
      .from('nodes')
      .select('vote_count')
      .eq('id', targetId)
      .single()

    const nextValue = (data?.vote_count ?? 0) + delta
    await supabase
      .from('nodes')
      .update({ vote_count: nextValue })
      .eq('id', targetId)
    return nextValue
  }

  if (targetType === 'edge') {
    const { data } = await supabase
      .from('edges')
      .select('vote_score')
      .eq('id', targetId)
      .single()

    const nextValue = (data?.vote_score ?? 0) + delta
    await supabase
      .from('edges')
      .update({ vote_score: nextValue })
      .eq('id', targetId)
    return nextValue
  }

  const { data } = await supabase
    .from('prompts')
    .select('engagement_score')
    .eq('id', targetId)
    .single()

  const nextValue = (data?.engagement_score ?? 0) + delta
  await supabase
    .from('prompts')
    .update({ engagement_score: nextValue })
    .eq('id', targetId)
  return nextValue
}
