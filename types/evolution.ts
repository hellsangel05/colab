import type { LabId } from '@/types'

export type EvolutionRunError = {
  lab: LabId
  message: string
}

export type EvolutionCycleResult = {
  success: boolean
  skipped: boolean
  reason?: string
  ranAt: string | null
  nextRunAt: string | null
  nodesSeeded: number
  edgesCreated: number
  resurfaced: number
  promptsGenerated: number
  errors: EvolutionRunError[]
}
