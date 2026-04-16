import { NextRequest, NextResponse } from 'next/server'

import { ensurePublicUserForAuthUser } from '@/lib/public-user'
import { requireAuthenticatedUser } from '@/lib/server-auth'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser(request)
    const supabase = getSupabaseAdminClient()
    const publicUser = await ensurePublicUserForAuthUser(user)

    const { data: nodes, error: nodesError } = await supabase
      .from('nodes')
      .select('*')
      .eq('submitted_by', user.id)
      .order('vote_count', { ascending: false })

    if (nodesError) {
      return NextResponse.json({ error: nodesError.message }, { status: 500 })
    }

    return NextResponse.json({
      user: publicUser,
      nodes: nodes ?? [],
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unauthorized.' },
      { status: 401 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser(request)
    const supabase = getSupabaseAdminClient()

    const { error } = await supabase.auth.admin.deleteUser(user.id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unauthorized.' },
      { status: 401 }
    )
  }
}
