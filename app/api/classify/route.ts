import { NextRequest, NextResponse } from 'next/server'

import { MODEL_CONFIG } from '@/lib/config'
import { getOpenAIClient } from '@/lib/openai'
import { LAB_IDS } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const content =
      typeof body?.content === 'string' ? body.content.trim() : ''

    if (!content) {
      return NextResponse.json({ lab: 'chaos' })
    }

    const openai = getOpenAIClient()
    const completion = await openai.chat.completions.create({
      model: MODEL_CONFIG.classify,
      messages: [
        {
          role: 'system',
          content: `You classify ideas into exactly one of these labs. Respond with only the lab id.\n\nstartup: business ideas, founder problems, products, markets\nstory: narrative ideas, characters, worlds, dialogue, scenes\nproblem: real-world frustrations, inefficiencies, broken systems\nmusic: songs, sound, production, genres, lyrics, sonic concepts\ninvention: physical products, hardware, objects, mechanisms\nmarketing: brands, positioning, campaigns, slogans, audience strategy\npopculture: film, tv, celebrity, sports, memes, internet culture\nresearch: science, history, philosophy, math, deep inquiry\nchaos: absurd, funny, wild-card, experimental thoughts\n\nIf unsure, choose chaos.`,
        },
        {
          role: 'user',
          content,
        },
      ],
      max_tokens: 10,
      temperature: 0,
    })

    const lab =
      completion.choices[0]?.message.content?.trim().toLowerCase() ?? 'chaos'

    return NextResponse.json({
      lab: LAB_IDS.includes(lab as (typeof LAB_IDS)[number]) ? lab : 'chaos',
    })
  } catch (error) {
    console.error('Classify error:', error)
    return NextResponse.json({ lab: 'chaos' })
  }
}
