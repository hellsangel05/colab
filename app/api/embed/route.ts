import { NextRequest, NextResponse } from 'next/server'

import { embedNodeById } from '@/lib/embed-node'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

type EmbedBody = {
  nodeId?: string
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser(request)
    const body = (await request.json()) as EmbedBody

    if (!body.nodeId) {
      return NextResponse.json({ error: 'Node id is required.' }, { status: 400 })
    }

    const supabase = getSupabaseAdminClient()
    const { data: node } = await supabase
      .from('nodes')
      .select('id, submitted_by, origin')
      .eq('id', body.nodeId)
      .single()

    if (!node) {
      return NextResponse.json({ error: 'Node not found.' }, { status: 404 })
    }

    if (node.origin === 'human' && node.submitted_by !== user.id) {
      return NextResponse.json(
        { error: 'You can only embed your own nodes.' },
        { status: 403 }
      )
    }

    const result = await embedNodeById(node.id)
    return NextResponse.json({ success: true, edges: result.edges })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unauthorized.' },
      { status: 401 }
    )
  }
}
