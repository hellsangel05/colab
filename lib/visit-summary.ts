import 'server-only'

import type { User } from '@supabase/supabase-js'

import { ensurePublicUserForAuthUser } from '@/lib/public-user'
import { getSupabaseAdminClient } from '@/lib/supabase-admin'
import type { Database } from '@/types/database'
import type {
  VisitSummaryItem,
  VisitSummaryResponse,
} from '@/types/visit-summary'

type NodeRow = Database['public']['Tables']['nodes']['Row']
type EdgeRow = Database['public']['Tables']['edges']['Row']
type CoLabUserRow = Database['public']['Tables']['users']['Row']

function previewContent(content: string, maxLength = 180) {
  return content.length > maxLength
    ? `${content.slice(0, maxLength - 1).trimEnd()}...`
    : content
}

function resolveEdgeNodes(edge: EdgeRow, contributedNodeIds: Set<string>) {
  const sourceIsOwned = contributedNodeIds.has(edge.source_node_id)
  const targetIsOwned = contributedNodeIds.has(edge.target_node_id)

  if (sourceIsOwned) {
    return {
      impactedNodeId: edge.source_node_id,
      relatedNodeId: edge.target_node_id,
    }
  }

  if (targetIsOwned) {
    return {
      impactedNodeId: edge.target_node_id,
      relatedNodeId: edge.source_node_id,
    }
  }

  return null
}

export async function getVisitSummaryForUser(authUser: User, limit: number) {
  const supabase = getSupabaseAdminClient()
  const now = new Date().toISOString()
  const user = await ensurePublicUserForAuthUser(authUser)

  const since = user.last_visit_summary_seen_at
  const until = now

  const { data: contributions, error: contributionsError } = await supabase
    .from('nodes')
    .select('id, content, lab')
    .eq('submitted_by', authUser.id)

  if (contributionsError) {
    throw new Error(contributionsError.message)
  }

  const contributedNodes = (contributions ?? []) as Pick<NodeRow, 'id' | 'content' | 'lab'>[]
  if (contributedNodes.length === 0) {
    return {
      summary: {
        since,
        until,
        unread: false,
        counts: {
          replies: 0,
          aiConnections: 0,
        },
        items: [],
        remainingCount: 0,
      } satisfies VisitSummaryResponse,
      user,
    }
  }

  const contributedNodeIds = contributedNodes.map((node) => node.id)
  const contributedNodeIdSet = new Set(contributedNodeIds)
  const contributedNodeMap = new Map(
    contributedNodes.map((node) => [node.id, node])
  )

  const [replyResult, sourceEdgeResult, targetEdgeResult] = await Promise.all([
    supabase
      .from('nodes')
      .select('id, content, lab, origin, submitted_by, parent_node_id, created_at')
      .in('parent_node_id', contributedNodeIds)
      .gt('created_at', since)
      .lte('created_at', until),
    supabase
      .from('edges')
      .select('*')
      .eq('origin', 'ai')
      .in('source_node_id', contributedNodeIds)
      .gt('created_at', since)
      .lte('created_at', until),
    supabase
      .from('edges')
      .select('*')
      .eq('origin', 'ai')
      .in('target_node_id', contributedNodeIds)
      .gt('created_at', since)
      .lte('created_at', until),
  ])

  if (replyResult.error) {
    throw new Error(replyResult.error.message)
  }

  if (sourceEdgeResult.error) {
    throw new Error(sourceEdgeResult.error.message)
  }

  if (targetEdgeResult.error) {
    throw new Error(targetEdgeResult.error.message)
  }

  const replies = ((replyResult.data ?? []) as Array<
    Pick<
      NodeRow,
      'id' | 'content' | 'lab' | 'origin' | 'submitted_by' | 'parent_node_id' | 'created_at'
    >
  >).filter((reply) => reply.submitted_by !== authUser.id)

  const dedupedEdges = new Map<string, EdgeRow>()
  for (const edge of [...(sourceEdgeResult.data ?? []), ...(targetEdgeResult.data ?? [])]) {
    dedupedEdges.set(edge.id, edge as EdgeRow)
  }

  const relatedNodeIds = new Set<string>()
  for (const edge of dedupedEdges.values()) {
    relatedNodeIds.add(edge.source_node_id)
    relatedNodeIds.add(edge.target_node_id)
  }

  const missingNodeIds = Array.from(relatedNodeIds).filter(
    (nodeId) => !contributedNodeMap.has(nodeId)
  )

  const relatedNodesMap = new Map(
    contributedNodes.map((node) => [node.id, node])
  )

  if (missingNodeIds.length > 0) {
    const { data: relatedNodes, error: relatedNodesError } = await supabase
      .from('nodes')
      .select('id, content, lab')
      .in('id', missingNodeIds)

    if (relatedNodesError) {
      throw new Error(relatedNodesError.message)
    }

    for (const node of relatedNodes ?? []) {
      relatedNodesMap.set(node.id, node)
    }
  }

  const replyItems: VisitSummaryItem[] = replies.flatMap((reply) => {
    if (!reply.parent_node_id) {
      return []
    }

    const impactedNode = contributedNodeMap.get(reply.parent_node_id)
    if (!impactedNode) {
      return []
    }

    return [
      {
        id: `reply:${reply.id}`,
        kind: 'reply',
        actor: reply.origin === 'ai' ? 'ai' : 'human',
        createdAt: reply.created_at,
        impactedNodeId: impactedNode.id,
        impactedNodePreview: previewContent(impactedNode.content),
        relatedNodeId: reply.id,
        relatedNodePreview: previewContent(reply.content),
        lab: impactedNode.lab,
      },
    ]
  })

  const aiConnectionItems: VisitSummaryItem[] = Array.from(dedupedEdges.values()).flatMap(
    (edge) => {
      const resolved = resolveEdgeNodes(edge, contributedNodeIdSet)
      if (!resolved) {
        return []
      }

      const impactedNode = relatedNodesMap.get(resolved.impactedNodeId)
      const relatedNode = relatedNodesMap.get(resolved.relatedNodeId)

      if (!impactedNode) {
        return []
      }

      return [
        {
          id: `ai_connection:${edge.id}`,
          kind: 'ai_connection',
          actor: 'ai',
          createdAt: edge.created_at,
          impactedNodeId: impactedNode.id,
          impactedNodePreview: previewContent(impactedNode.content),
          relatedNodeId: relatedNode?.id,
          relatedNodePreview: relatedNode
            ? previewContent(relatedNode.content)
            : undefined,
          relationshipType: edge.relationship_type,
          lab: impactedNode.lab,
        },
      ]
    }
  )

  const items = [...replyItems, ...aiConnectionItems].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
  )

  return {
    summary: {
      since,
      until,
      unread: items.length > 0,
      counts: {
        replies: replyItems.length,
        aiConnections: aiConnectionItems.length,
      },
      items: items.slice(0, limit),
      remainingCount: Math.max(items.length - limit, 0),
    } satisfies VisitSummaryResponse,
    user: user as Pick<CoLabUserRow, 'id' | 'last_visit_summary_seen_at'>,
  }
}

export async function markVisitSummarySeenForUser(
  authUser: User,
  seenThrough: string
) {
  const supabase = getSupabaseAdminClient()
  const parsedSeenThrough = new Date(seenThrough)

  if (Number.isNaN(parsedSeenThrough.getTime())) {
    throw new Error('Invalid seenThrough timestamp.')
  }

  const user = await ensurePublicUserForAuthUser(authUser)

  const currentSeenAt = new Date(user.last_visit_summary_seen_at)
  const nextSeenAt =
    currentSeenAt.getTime() > parsedSeenThrough.getTime()
      ? currentSeenAt.toISOString()
      : parsedSeenThrough.toISOString()

  const { error: updateError } = await supabase
    .from('users')
    .update({
      last_visit_summary_seen_at: nextSeenAt,
    })
    .eq('id', authUser.id)

  if (updateError) {
    throw new Error(updateError.message)
  }

  return nextSeenAt
}
