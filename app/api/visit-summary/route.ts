import { NextRequest, NextResponse } from 'next/server'

import { requireAuthenticatedUser } from '@/lib/server-auth'
import { getVisitSummaryForUser } from '@/lib/visit-summary'

const DEFAULT_LIMIT = 5
const MAX_LIMIT = 25

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser(request)
    const searchParams = request.nextUrl.searchParams
    const parsedLimit = Number(searchParams.get('limit') ?? DEFAULT_LIMIT)
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(Math.floor(parsedLimit), 1), MAX_LIMIT)
      : DEFAULT_LIMIT

    const { summary } = await getVisitSummaryForUser(user, limit)
    return NextResponse.json(summary)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unauthorized.' },
      { status: 401 }
    )
  }
}
