import { NextResponse } from 'next/server'

import { runEvolutionCycle } from '@/lib/run-evolution'

export async function POST() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'Admin routes are only available in development.' },
      { status: 403 }
    )
  }

  try {
    const result = await runEvolutionCycle({ force: true })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Evolution request failed.',
      },
      { status: 500 }
    )
  }
}
