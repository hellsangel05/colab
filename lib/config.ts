import { LAB_IDS, RELATIONSHIP_TYPES } from '@/types'

const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini'
const OPENAI_DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'

function requireServerEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

export function getPublicEnv() {
  return {
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  }
}

export function getServerEnv() {
  return {
    supabaseUrl: requireServerEnv('NEXT_PUBLIC_SUPABASE_URL'),
    supabaseAnonKey: requireServerEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    supabaseServiceRoleKey: requireServerEnv('SUPABASE_SERVICE_ROLE_KEY'),
    openAiApiKey: requireServerEnv('OPENAI_API_KEY'),
    evolutionSecret: requireServerEnv('EVOLUTION_SECRET'),
  }
}

export const MODEL_CONFIG = {
  classify: process.env.OPENAI_CLASSIFY_MODEL ?? OPENAI_DEFAULT_MODEL,
  generation: process.env.OPENAI_GENERATION_MODEL ?? OPENAI_DEFAULT_MODEL,
  embeddings:
    process.env.OPENAI_EMBEDDING_MODEL ?? OPENAI_DEFAULT_EMBEDDING_MODEL,
}

export const APP_LIMITS = {
  anonymousSubmissionsPerDay: 10,
  feedNodeLimit: 30,
  tickerNodeLimit: 12,
  similarityThreshold: 0.65,
  similarNodeMatchCount: 8,
  maxEdgesPerNode: 5,
  evolutionIntervalMinutes: 30,
  quietLabThreshold: 4,
}

export const VALIDATION = {
  minNodeLength: 1,
  maxNodeLength: 2000,
  maxRoomTitleLength: 120,
  maxRoomDirectionLength: 400,
  maxOpeningQuestionLength: 240,
  maxReportReasonLength: 240,
  maxUsernameLength: 32,
}

export const COLAB_CONFIG = {
  labIds: LAB_IDS,
  relationshipTypes: RELATIONSHIP_TYPES,
}
