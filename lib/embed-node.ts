import 'server-only'

import { APP_LIMITS, MODEL_CONFIG } from '@/lib/config'
import { getOpenAIClient } from '@/lib/openai'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import { RELATIONSHIP_TYPES, type LabId } from '@/types'

type SimilarNode = {
  id: string
  content: string
  lab: LabId
  similarity: number
}

export async function embedNodeById(nodeId: string) {
  const supabase = getSupabaseAdminClient()
  const openai = getOpenAIClient()

  const { data: node, error: nodeError } = await supabase
    .from('nodes')
    .select('id, content, lab')
    .eq('id', nodeId)
    .single()

  if (nodeError || !node) {
    throw new Error(nodeError?.message ?? 'Node not found.')
  }

  const embeddingResult = await openai.embeddings.create({
    model: MODEL_CONFIG.embeddings,
    input: node.content,
  })

  const embedding = embeddingResult.data[0]?.embedding
  if (!embedding) {
    throw new Error('Embedding generation failed.')
  }

  const vectorLiteral = `[${embedding.join(',')}]`

  await supabase.rpc('update_node_embedding', {
    node_id: node.id,
    embedding_vector: vectorLiteral,
  })

  const { data: similarNodes, error: similarNodesError } = await supabase.rpc(
    'find_similar_nodes',
    {
      query_embedding: vectorLiteral,
      match_threshold: APP_LIMITS.similarityThreshold,
      match_count: APP_LIMITS.similarNodeMatchCount,
      exclude_id: node.id,
    }
  )

  if (similarNodesError) {
    throw new Error(similarNodesError.message)
  }

  const matches = (similarNodes ?? []) as SimilarNode[]
  if (matches.length === 0) {
    return { edges: 0 }
  }

  await supabase
    .from('edges')
    .delete()
    .eq('source_node_id', node.id)
    .eq('origin', 'ai')

  let edgesCreated = 0

  for (const match of matches.slice(0, APP_LIMITS.maxEdgesPerNode)) {
    const relationshipResponse = await openai.chat.completions.create({
      model: MODEL_CONFIG.generation,
      messages: [
        {
          role: 'system',
          content: `Classify the relationship between two ideas. Respond with only one of: ${RELATIONSHIP_TYPES.join(', ')}.`,
        },
        {
          role: 'user',
          content: `Idea A: "${node.content}"\nIdea B: "${match.content}"`,
        },
      ],
      max_tokens: 10,
      temperature: 0,
    })

    const relationshipType =
      relationshipResponse.choices[0]?.message.content?.trim().toLowerCase() ??
      'expands'
    const safeRelationshipType = RELATIONSHIP_TYPES.includes(
      relationshipType as (typeof RELATIONSHIP_TYPES)[number]
    )
      ? relationshipType
      : 'expands'

    const { error } = await supabase.from('edges').upsert(
      {
        source_node_id: node.id,
        target_node_id: match.id,
        relationship_type:
          safeRelationshipType as (typeof RELATIONSHIP_TYPES)[number],
        confidence_score: match.similarity,
        origin: 'ai',
        source_lab: node.lab,
        target_lab: match.lab,
        is_cross_lab: node.lab !== match.lab,
        vote_score: 0,
      },
      {
        onConflict: 'source_node_id,target_node_id',
      }
    )

    if (!error) {
      edgesCreated += 1
    }
  }

  await supabase
    .from('nodes')
    .update({ last_active_at: new Date().toISOString() })
    .in('id', [node.id, ...matches.map((match) => match.id)])

  return { edges: edgesCreated }
}
