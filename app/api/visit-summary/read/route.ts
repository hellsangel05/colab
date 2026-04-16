import { NextRequest, NextResponse } from 'next/server'

import { requireAuthenticatedUser } from '@/lib/server-auth'
import { markVisitSummarySeenForUser } from '@/lib/visit-summary'

type MarkVisitSummaryReadBody = {
  seenThrough?: string
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser(request)
    const body = (await request.json()) as MarkVisitSummaryReadBody
    const seenThrough =
      typeof body.seenThrough === 'string' ? body.seenThrough : ''

    if (!seenThrough) {
      return NextResponse.json(
        { error: 'seenThrough is required.' },
        { status: 400 }
      )
    }

    const lastVisitSummarySeenAt = await markVisitSummarySeenForUser(user, seenThrough)

    return NextResponse.json({
      success: true,
      lastVisitSummarySeenAt,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to mark summary as read.'
    const status = message === 'Invalid seenThrough timestamp.' ? 400 : 401

    return NextResponse.json({ error: message }, { status })
  }
}
