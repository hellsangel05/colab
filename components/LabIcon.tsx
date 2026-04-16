'use client'

import type { ComponentType } from 'react'
import type { LucideProps } from 'lucide-react'
import {
  BookOpen,
  Clapperboard,
  Cog,
  Megaphone,
  Microscope,
  Music4,
  Rocket,
  Search,
  Sparkles,
} from 'lucide-react'

import type { LabId } from '@/types'

const LAB_ICON_MAP = {
  startup: Rocket,
  story: BookOpen,
  problem: Search,
  music: Music4,
  invention: Cog,
  marketing: Megaphone,
  popculture: Clapperboard,
  research: Microscope,
  chaos: Sparkles,
} satisfies Record<LabId, ComponentType<LucideProps>>

type Props = LucideProps & {
  labId: LabId
}

export default function LabIcon({ labId, ...props }: Props) {
  const Icon = LAB_ICON_MAP[labId]
  return <Icon {...props} />
}
