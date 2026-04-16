import { NextRequest, NextResponse } from 'next/server'

import { getServerEnv } from '@/lib/config'
import { runEvolutionCycle } from '@/lib/run-evolution'

function isAuthorized(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${getServerEnv().evolutionSecret}`
}

async function handleEvolutionRequest(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // We return 202 Accepted immediately to avoid Vercel timeouts for the caller.
  // Note: The actual work will continue in the background as long as the
  // Vercel execution context allows.

  // We trigger the process but don't 'await' it here so we can respond quickly.
  // However, to avoid unhandled promise rejections, we catch errors inside runEvolutionCycle.
  runEvolutionCycle().catch((error) => {
    console.error('Background evolution error:', error);
  });

  return NextResponse.json({
    message: 'Evolution cycle initiated.',
    status: 'processing'
  }, { status: 202 })
}

export async function GET(request: NextRequest) {
  return handleEvolutionRequest(request)
}

export async function POST(request: NextRequest) {
  return handleEvolutionRequest(request)
}
