import { createClient } from '@supabase/supabase-js'

import { APP_LIMITS } from '@/lib/config'
import type { Database } from '@/types/database'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for seed.'
  )
}

const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const seedNodes: Database['public']['Tables']['nodes']['Insert'][] = [
  {
    content:
      "There's no good tool for people who are grieving to manage the administrative nightmare that comes with death. Canceling subscriptions, closing accounts, notifying institutions. It's brutal and nobody talks about it.",
    lab: 'startup',
    node_type: 'problem',
    origin: 'ai',
    is_seed: true,
  },
  {
    content:
      "Every small restaurant does their own loyalty program badly. One universal one would eat their lunch.",
    lab: 'startup',
    node_type: 'problem',
    origin: 'ai',
    is_seed: true,
  },
  {
    content:
      'A cartographer who maps places that do not exist yet. One day the places start appearing.',
    lab: 'story',
    node_type: 'concept',
    origin: 'ai',
    is_seed: true,
  },
  {
    content:
      'Two strangers keep ending up in the same photos in the background. Neither of them is the subject.',
    lab: 'story',
    node_type: 'concept',
    origin: 'ai',
    is_seed: true,
  },
  {
    content:
      "There's no good way to communicate 'I'm running 10 minutes late' without it becoming a whole apology ritual.",
    lab: 'problem',
    node_type: 'problem',
    origin: 'ai',
    is_seed: true,
  },
  {
    content:
      'The most emotionally devastating musical choice is silence right before the resolution. One beat. The brain fills it with everything it has been holding.',
    lab: 'music',
    node_type: 'concept',
    origin: 'ai',
    is_seed: true,
  },
  {
    content:
      "Staples. We've been mechanically puncturing paper and bending metal through it since 1868. The entire system exists to solve a problem created by the staple itself.",
    lab: 'invention',
    node_type: 'problem',
    origin: 'ai',
    is_seed: true,
  },
  {
    content:
      "Every sustainable brand says 'we're building a better future.' Nobody believes it anymore. The brands that actually land admit the present is broken.",
    lab: 'marketing',
    node_type: 'concept',
    origin: 'ai',
    is_seed: true,
  },
  {
    content:
      'Every generation thinks the music of their youth was objectively better. Every generation is wrong and also completely right.',
    lab: 'popculture',
    node_type: 'concept',
    origin: 'ai',
    is_seed: true,
  },
  {
    content:
      "We measure intelligence by how well someone solves problems we already know the answers to. That might be measuring the exact wrong thing.",
    lab: 'research',
    node_type: 'concept',
    origin: 'ai',
    is_seed: true,
  },
  {
    content:
      'A gym where all the equipment is just household chores. You pay $40 a month to do laundry competitively.',
    lab: 'chaos',
    node_type: 'concept',
    origin: 'ai',
    is_seed: true,
  },
]

const seedPrompts: Database['public']['Tables']['prompts']['Insert'][] = [
  {
    lab: 'startup',
    content:
      "What's something you've complained about more than three times that nobody's built a solution for yet?",
    options: [],
    origin: 'ai',
  },
  {
    lab: 'story',
    content:
      'Give your protagonist one flaw that makes them hard to root for but impossible to look away from.',
    options: [],
    origin: 'ai',
  },
  {
    lab: 'problem',
    content:
      "What's a problem everyone has but nobody talks about like it's a real problem?",
    options: [],
    origin: 'ai',
  },
  {
    lab: 'music',
    content: 'What emotion has never had its perfect song written for it yet?',
    options: [],
    origin: 'ai',
  },
  {
    lab: 'invention',
    content:
      "What's something we build the same way we've always built it despite obviously better options existing?",
    options: [],
    origin: 'ai',
  },
  {
    lab: 'marketing',
    content: 'What brand would you actually trust if it existed?',
    options: [],
    origin: 'ai',
  },
  {
    lab: 'popculture',
    content:
      "What's a movie everyone agrees is good for the wrong reasons?",
    options: [],
    origin: 'ai',
  },
  {
    lab: 'research',
    content:
      'What question is hiding inside a question everyone thinks is already answered?',
    options: [],
    origin: 'ai',
  },
  {
    lab: 'chaos',
    content:
      "What's a business that absolutely should not exist but would definitely make money?",
    options: [],
    origin: 'ai',
  },
]

async function seed() {
  await supabase
    .from('reports')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase
    .from('votes')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase
    .from('edges')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase
    .from('project_rooms')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase
    .from('prompts')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase
    .from('nodes')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase
    .from('evolution_log')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')

  for (const seedNode of seedNodes) {
    await supabase.from('nodes').insert({
      ...seedNode,
      vote_count: Math.floor(Math.random() * 40) + 4,
      status: 'active',
      moderation_status: 'visible',
    })
  }

  for (const prompt of seedPrompts) {
    await supabase.from('prompts').insert({
      ...prompt,
      status: 'active',
      chain_depth: 0,
      engagement_score: 0,
      response_count: 0,
      open_text_ratio: 1,
    })
  }

  await supabase.from('evolution_log').insert({
    next_run_at: new Date(
      Date.now() + APP_LIMITS.evolutionIntervalMinutes * 60 * 1000
    ).toISOString(),
    nodes_seeded: seedNodes.length,
    edges_created: 0,
    nodes_resurfaced: 0,
    prompts_generated: seedPrompts.length,
  })

  console.log('Seeded Co-Lab dev data.')
}

seed().catch((error) => {
  console.error(error)
  process.exit(1)
})
