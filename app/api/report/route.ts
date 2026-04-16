import { NextRequest, NextResponse } from 'next/server'

import { VALIDATION } from '@/lib/config'
import { ensurePublicUserForAuthUser } from '@/lib/public-user'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type ReportBody = {
  nodeId?: string
  reason?: string | null
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser(request)
    await ensurePublicUserForAuthUser(user)
    const body = (await request.json()) as ReportBody
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

    if (!body.nodeId) {
      return NextResponse.json({ error: 'Node id is required.' }, { status: 400 })
    }

    if (reason.length > VALIDATION.maxReportReasonLength) {
      return NextResponse.json(
        {
          error: `Reason must be at most ${VALIDATION.maxReportReasonLength} characters.`,
        },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdminClient()
    const { data: node } = await supabase
      .from('nodes')
      .select('id')
      .eq('id', body.nodeId)
      .single()

    if (!node) {
      return NextResponse.json({ error: 'Node not found.' }, { status: 404 })
    }

    const { error: reportError } = await supabase.from('reports').upsert(
      {
        node_id: node.id,
        reported_by: user.id,
        reason: reason || null,
        status: 'open',
      },
      {
        onConflict: 'node_id,reported_by',
      }
    )

    if (reportError) {
      return NextResponse.json({ error: reportError.message }, { status: 500 })
    }

    await supabase
      .from('nodes')
      .update({ moderation_status: 'hidden' })
      .eq('id', node.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unauthorized.' },
      { status: 401 }
    )
  }
}
