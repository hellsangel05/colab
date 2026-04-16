import 'server-only'

import { APP_LIMITS, MODEL_CONFIG } from '@/lib/config'
import { embedNodeById } from '@/lib/embed-node'
import { getOpenAIClient } from '@/lib/openai'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import type { EvolutionCycleResult, EvolutionRunError } from '@/types/evolution'
import { LAB_IDS } from '@/types'

type RunEvolutionOptions = {
  force?: boolean
}

function getEvolutionIntervalMs() {
  return APP_LIMITS.evolutionIntervalMinutes * 60 * 1000
}

function buildNextRunAt(from = Date.now()) {
  return new Date(from + getEvolutionIntervalMs()).toISOString()
}

function ensureMutationSucceeded(error: { message: string } | null, message: string) {
  if (error) {
    throw new Error(`${message} ${error.message}`)
  }
}

export async function runEvolutionCycle(
  options: RunEvolutionOptions = {}
): Promise<EvolutionCycleResult> {
  const supabase = getSupabaseAdminClient()
  const openai = getOpenAIClient()
  const force = options.force ?? false
  const startedAt = new Date().toISOString()

  const { data: latestLog, error: latestLogError } = await supabase
    .from('evolution_log')
    .select('ran_at, next_run_at')
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latestLogError) {
    throw new Error(`Failed to load current evolution schedule. ${latestLogError.message}`)
  }

  if (!force && latestLog?.next_run_at) {
    const dueAt = new Date(latestLog.next_run_at).getTime()
    if (Number.isFinite(dueAt) && dueAt > Date.now()) {
      return {
        success: true,
        skipped: true,
        reason: 'Evolution is not due yet.',
        ranAt: latestLog.ran_at ?? null,
        nextRunAt: latestLog.next_run_at,
        nodesSeeded: 0,
        edgesCreated: 0,
        resurfaced: 0,
        promptsGenerated: 0,
        errors: [],
      }
    }
  }

  let nodesSeeded = 0
  let resurfaced = 0
  let promptsGenerated = 0
  let edgesCreated = 0
  const errors: EvolutionRunError[] = []

  for (const lab of LAB_IDS) {
    try {
      const quietWindowStart = new Date(
        Date.now() - getEvolutionIntervalMs()
      ).toISOString()
      const { count, error: recentNodeCountError } = await supabase
        .from('nodes')
        .select('id', { count: 'exact', head: true })
        .eq('lab', lab)
        .eq('origin', 'human')
        .gte('created_at', quietWindowStart)
      ensureMutationSucceeded(recentNodeCountError, `Failed to count recent nodes for ${lab}.`)

      if ((count ?? 0) < APP_LIMITS.quietLabThreshold) {
        const seedCompletion = await openai.chat.completions.create({
          model: MODEL_CONFIG.generation,
          messages: [
            {
              role: 'system',
              content: `Write one sharp, specific thought for Co-Lab's ${lab} lab. Keep it to 1-3 sentences. Sound like a smart human thinking out loud.`,
            },
          ],
          max_tokens: 180,
        })

        const seedContent = seedCompletion.choices[0]?.message.content?.trim()
        if (seedContent) {
          const { data: insertedNode, error: insertNodeError } = await supabase
            .from('nodes')
            .insert({
              content: seedContent,
              lab,
              origin: 'ai',
              submitted_by: null,
              node_type: 'concept',
              status: 'active',
              moderation_status: 'visible',
              vote_count: 0,
              is_seed: true,
            })
            .select('id')
            .single()
          ensureMutationSucceeded(insertNodeError, `Failed to seed a node for ${lab}.`)

          if (insertedNode) {
            nodesSeeded += 1
            const embedResult = await embedNodeById(insertedNode.id)
            edgesCreated += embedResult.edges
          }
        }
      }

      const { data: dormantNode, error: dormantNodeError } = await supabase
        .from('nodes')
        .select('id')
        .eq('lab', lab)
        .eq('status', 'dormant')
        .order('last_active_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      ensureMutationSucceeded(dormantNodeError, `Failed to load dormant nodes for ${lab}.`)

      if (dormantNode) {
        const { error: resurfaceError } = await supabase
          .from('nodes')
          .update({
            status: 'active',
            last_active_at: new Date().toISOString(),
          })
          .eq('id', dormantNode.id)
        ensureMutationSucceeded(resurfaceError, `Failed to resurface a node for ${lab}.`)
        resurfaced += 1
      }

      const { error: archivePromptsError } = await supabase
        .from('prompts')
        .update({ status: 'archived' })
        .eq('lab', lab)
        .eq('status', 'active')
      ensureMutationSucceeded(archivePromptsError, `Failed to archive prompts for ${lab}.`)

      const promptCompletion = await openai.chat.completions.create({
        model: MODEL_CONFIG.generation,
        messages: [
          {
            role: 'system',
            content: `Generate one conversational open-text prompt for Co-Lab's ${lab} lab. Return JSON with this exact shape: {"content":"prompt text"}.`,
          },
        ],
        max_tokens: 120,
        response_format: { type: 'json_object' },
      })

      const parsed = JSON.parse(
        promptCompletion.choices[0]?.message.content ?? '{}'
      ) as { content?: string }

      if (parsed.content) {
        const { error: insertPromptError } = await supabase.from('prompts').insert({
          content: parsed.content,
          lab,
          origin: 'ai',
          status: 'active',
          chain_depth: 0,
          options: [],
          engagement_score: 0,
          response_count: 0,
          open_text_ratio: 1,
        })
        ensureMutationSucceeded(insertPromptError, `Failed to insert a prompt for ${lab}.`)
        promptsGenerated += 1
      }
    } catch (error) {
      console.error(`Evolution failed for lab ${lab}:`, error)
      errors.push({
        lab,
        message: error instanceof Error ? error.message : 'Unknown evolution error.',
      })
    }
  }

  const nextRunAt = buildNextRunAt()

  const { error: evolutionLogError } = await supabase.from('evolution_log').insert({
    ran_at: startedAt,
    next_run_at: nextRunAt,
    nodes_seeded: nodesSeeded,
    edges_created: edgesCreated,
    nodes_resurfaced: resurfaced,
    prompts_generated: promptsGenerated,
  })
  ensureMutationSucceeded(evolutionLogError, 'Failed to write the evolution log.')

  return {
    success: errors.length === 0,
    skipped: false,
    ranAt: startedAt,
    nodesSeeded,
    edgesCreated,
    resurfaced,
    promptsGenerated,
    nextRunAt,
    errors,
  }
}
