export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          anon_session_id: string
          username: string | null
          email: string | null
          created_at: string
          last_visit_summary_seen_at: string
          lab_preferences: string[]
          contribution_count: number
          is_flagged: boolean
        }
        Insert: {
          id: string
          anon_session_id?: string
          username?: string | null
          email?: string | null
          created_at?: string
          last_visit_summary_seen_at?: string
          lab_preferences?: string[]
          contribution_count?: number
          is_flagged?: boolean
        }
        Update: {
          anon_session_id?: string
          username?: string | null
          email?: string | null
          created_at?: string
          last_visit_summary_seen_at?: string
          lab_preferences?: string[]
          contribution_count?: number
          is_flagged?: boolean
        }
        Relationships: []
      }
      nodes: {
        Row: {
          id: string
          content: string
          lab: Database['public']['Enums']['lab_id']
          origin: Database['public']['Enums']['node_origin']
          submitted_by: string | null
          node_type: string
          status: Database['public']['Enums']['node_status']
          moderation_status: Database['public']['Enums']['moderation_status']
          vote_count: number
          embedding: string | null
          parent_node_id: string | null
          prompt_id: string | null
          created_at: string
          last_active_at: string
          is_seed: boolean
        }
        Insert: {
          id?: string
          content: string
          lab: Database['public']['Enums']['lab_id']
          origin?: Database['public']['Enums']['node_origin']
          submitted_by?: string | null
          node_type?: string
          status?: Database['public']['Enums']['node_status']
          moderation_status?: Database['public']['Enums']['moderation_status']
          vote_count?: number
          embedding?: string | null
          parent_node_id?: string | null
          prompt_id?: string | null
          created_at?: string
          last_active_at?: string
          is_seed?: boolean
        }
        Update: {
          content?: string
          lab?: Database['public']['Enums']['lab_id']
          origin?: Database['public']['Enums']['node_origin']
          submitted_by?: string | null
          node_type?: string
          status?: Database['public']['Enums']['node_status']
          moderation_status?: Database['public']['Enums']['moderation_status']
          vote_count?: number
          embedding?: string | null
          parent_node_id?: string | null
          prompt_id?: string | null
          created_at?: string
          last_active_at?: string
          is_seed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'nodes_parent_node_id_fkey'
            columns: ['parent_node_id']
            isOneToOne: false
            referencedRelation: 'nodes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'nodes_prompt_id_fkey'
            columns: ['prompt_id']
            isOneToOne: false
            referencedRelation: 'prompts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'nodes_submitted_by_fkey'
            columns: ['submitted_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      edges: {
        Row: {
          id: string
          source_node_id: string
          target_node_id: string
          relationship_type: Database['public']['Enums']['relationship_type']
          confidence_score: number
          origin: Database['public']['Enums']['node_origin']
          source_lab: Database['public']['Enums']['lab_id']
          target_lab: Database['public']['Enums']['lab_id']
          is_cross_lab: boolean
          created_at: string
          vote_score: number
        }
        Insert: {
          id?: string
          source_node_id: string
          target_node_id: string
          relationship_type: Database['public']['Enums']['relationship_type']
          confidence_score?: number
          origin?: Database['public']['Enums']['node_origin']
          source_lab: Database['public']['Enums']['lab_id']
          target_lab: Database['public']['Enums']['lab_id']
          is_cross_lab?: boolean
          created_at?: string
          vote_score?: number
        }
        Update: {
          relationship_type?: Database['public']['Enums']['relationship_type']
          confidence_score?: number
          vote_score?: number
        }
        Relationships: [
          {
            foreignKeyName: 'edges_source_node_id_fkey'
            columns: ['source_node_id']
            isOneToOne: false
            referencedRelation: 'nodes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'edges_target_node_id_fkey'
            columns: ['target_node_id']
            isOneToOne: false
            referencedRelation: 'nodes'
            referencedColumns: ['id']
          },
        ]
      }
      votes: {
        Row: {
          id: string
          target_id: string
          target_type: Database['public']['Enums']['vote_target_type']
          voted_by: string
          value: number
          created_at: string
        }
        Insert: {
          id?: string
          target_id: string
          target_type: Database['public']['Enums']['vote_target_type']
          voted_by: string
          value: number
          created_at?: string
        }
        Update: {
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: 'votes_voted_by_fkey'
            columns: ['voted_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      prompts: {
        Row: {
          id: string
          content: string
          lab: Database['public']['Enums']['lab_id']
          origin: Database['public']['Enums']['node_origin']
          parent_prompt_id: string | null
          parent_node_id: string | null
          chain_depth: number
          status: Database['public']['Enums']['prompt_status']
          engagement_score: number
          response_count: number
          open_text_ratio: number
          options: string[]
          created_at: string
          expires_at: string | null
        }
        Insert: {
          id?: string
          content: string
          lab: Database['public']['Enums']['lab_id']
          origin?: Database['public']['Enums']['node_origin']
          parent_prompt_id?: string | null
          parent_node_id?: string | null
          chain_depth?: number
          status?: Database['public']['Enums']['prompt_status']
          engagement_score?: number
          response_count?: number
          open_text_ratio?: number
          options?: string[]
          created_at?: string
          expires_at?: string | null
        }
        Update: {
          content?: string
          status?: Database['public']['Enums']['prompt_status']
          engagement_score?: number
          response_count?: number
          open_text_ratio?: number
          expires_at?: string | null
          options?: string[]
        }
        Relationships: [
          {
            foreignKeyName: 'prompts_parent_prompt_id_fkey'
            columns: ['parent_prompt_id']
            isOneToOne: false
            referencedRelation: 'prompts'
            referencedColumns: ['id']
          },
        ]
      }
      project_rooms: {
        Row: {
          id: string
          origin_node_id: string
          opened_by: string
          title: string
          direction: string | null
          opening_question: string | null
          roles_needed: string[]
          status: Database['public']['Enums']['room_status']
          contributor_ids: string[]
          build_log: Json[]
          external_url: string | null
          created_at: string
          last_active_at: string
        }
        Insert: {
          id?: string
          origin_node_id: string
          opened_by: string
          title: string
          direction?: string | null
          opening_question?: string | null
          roles_needed?: string[]
          status?: Database['public']['Enums']['room_status']
          contributor_ids?: string[]
          build_log?: Json[]
          external_url?: string | null
          created_at?: string
          last_active_at?: string
        }
        Update: {
          title?: string
          direction?: string | null
          opening_question?: string | null
          roles_needed?: string[]
          status?: Database['public']['Enums']['room_status']
          contributor_ids?: string[]
          build_log?: Json[]
          external_url?: string | null
          last_active_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'project_rooms_opened_by_fkey'
            columns: ['opened_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'project_rooms_origin_node_id_fkey'
            columns: ['origin_node_id']
            isOneToOne: false
            referencedRelation: 'nodes'
            referencedColumns: ['id']
          },
        ]
      }
      evolution_log: {
        Row: {
          id: string
          ran_at: string
          next_run_at: string | null
          nodes_seeded: number
          edges_created: number
          nodes_resurfaced: number
          prompts_generated: number
        }
        Insert: {
          id?: string
          ran_at?: string
          next_run_at?: string | null
          nodes_seeded?: number
          edges_created?: number
          nodes_resurfaced?: number
          prompts_generated?: number
        }
        Update: {
          next_run_at?: string | null
          nodes_seeded?: number
          edges_created?: number
          nodes_resurfaced?: number
          prompts_generated?: number
        }
        Relationships: []
      }
      reports: {
        Row: {
          id: string
          node_id: string
          reported_by: string
          reason: string | null
          status: Database['public']['Enums']['report_status']
          created_at: string
          reviewed_at: string | null
        }
        Insert: {
          id?: string
          node_id: string
          reported_by: string
          reason?: string | null
          status?: Database['public']['Enums']['report_status']
          created_at?: string
          reviewed_at?: string | null
        }
        Update: {
          reason?: string | null
          status?: Database['public']['Enums']['report_status']
          reviewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'reports_node_id_fkey'
            columns: ['node_id']
            isOneToOne: false
            referencedRelation: 'nodes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'reports_reported_by_fkey'
            columns: ['reported_by']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      find_similar_nodes: {
        Args: {
          query_embedding: string
          match_threshold: number
          match_count: number
          exclude_id: string
        }
        Returns: {
          id: string
          content: string
          lab: Database['public']['Enums']['lab_id']
          similarity: number
        }[]
      }
      update_node_embedding: {
        Args: {
          node_id: string
          embedding_vector: string
        }
        Returns: undefined
      }
    }
    Enums: {
      lab_id:
        | 'startup'
        | 'story'
        | 'problem'
        | 'music'
        | 'invention'
        | 'marketing'
        | 'popculture'
        | 'research'
        | 'chaos'
      node_origin: 'human' | 'ai'
      node_status: 'active' | 'dormant' | 'taken_live' | 'archived'
      moderation_status: 'visible' | 'flagged' | 'hidden'
      relationship_type:
        | 'solves'
        | 'expands'
        | 'contradicts'
        | 'metaphor_for'
        | 'version_of'
        | 'completes'
        | 'combines'
      vote_target_type: 'node' | 'edge' | 'prompt'
      prompt_status: 'active' | 'dormant' | 'archived'
      room_status: 'open' | 'building' | 'taken_live' | 'dormant'
      report_status: 'open' | 'reviewed'
    }
  }
}
