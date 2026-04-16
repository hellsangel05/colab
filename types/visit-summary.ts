import type { Database } from '@/types/database'

type LabId = Database['public']['Enums']['lab_id']
type RelationshipType = Database['public']['Enums']['relationship_type']

export type VisitSummaryItem = {
  id: string
  kind: 'reply' | 'ai_connection'
  actor: 'ai' | 'human'
  createdAt: string
  impactedNodeId: string
  impactedNodePreview: string
  relatedNodeId?: string
  relatedNodePreview?: string
  relationshipType?: RelationshipType
  lab: LabId
}

export type VisitSummaryResponse = {
  since: string
  until: string
  unread: boolean
  counts: {
    replies: number
    aiConnections: number
  }
  items: VisitSummaryItem[]
  remainingCount: number
}
