import OpenAI from 'openai'

import { getServerEnv } from '@/lib/config'

let openaiClient: OpenAI | null = null

export function getOpenAIClient() {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: getServerEnv().openAiApiKey })
  }

  return openaiClient
}
