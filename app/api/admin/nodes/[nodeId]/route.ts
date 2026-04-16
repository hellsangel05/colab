import { NextRequest, NextResponse } from 'next/server'

import { getSupabaseAdminClient } from '@/lib/supabase-admin'

function ensureDevelopmentMode() {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Admin routes are only available in development.')
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ nodeId: string }> }
) {
  try {
    ensureDevelopmentMode()
    const { nodeId } = await context.params
    const body = (await request.json()) as {
      content?: string
      status?: 'active' | 'dormant' | 'archived' | 'taken_live'
      moderationStatus?: 'visible' | 'flagged' | 'hidden'
    }

    const updates: Record<string, string> = {}
    if (typeof body.content === 'string' && body.content.trim()) {
      updates.content = body.content.trim()
    }

    if (body.status) {
      updates.status = body.status
    }

    if (body.moderationStatus) {
      updates.moderation_status = body.moderationStatus
    }

    const supabase = getSupabaseAdminClient()
    const { data: node, error } = await supabase
      .from('nodes')
      .update(updates)
      .eq('id', nodeId)
      .select('*')
      .single()

    if (error || !node) {
      return NextResponse.json(
        { error: error?.message ?? 'Failed to update node.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ node })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Admin route failed.' },
      { status: 403 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ nodeId: string }> }
) {
  try {
    ensureDevelopmentMode()
    const { nodeId } = await context.params
    const supabase = getSupabaseAdminClient()
    const { error } = await supabase.from('nodes').delete().eq('id', nodeId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Admin route failed.' },
      { status: 403 }
    )
  }
}
