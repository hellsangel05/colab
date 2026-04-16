import { createClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

export type { Database }

export type TableName = keyof Database['public']['Tables']

export type TableRow<T extends TableName> = Database['public']['Tables'][T]['Row']
export type TableInsert<T extends TableName> = Database['public']['Tables'][T]['Insert']
export type TableUpdate<T extends TableName> = Database['public']['Tables'][T]['Update']

export type NodeRecord = TableRow<'nodes'>
export type EdgeRecord = TableRow<'edges'>
export type VoteRecord = TableRow<'votes'>
export type PromptRecord = TableRow<'prompts'>
export type ProjectRoomRecord = TableRow<'project_rooms'>
export type CoLabUserRecord = TableRow<'users'>
export type ReportRecord = TableRow<'reports'>

export type Node = NodeRecord
export type Edge = EdgeRecord
export type Vote = VoteRecord
export type Prompt = PromptRecord
export type ProjectRoom = ProjectRoomRecord
export type CoLabUser = CoLabUserRecord
export type Report = ReportRecord
