export const LAB_IDS = [
  'startup',
  'story',
  'problem',
  'music',
  'invention',
  'marketing',
  'popculture',
  'research',
  'chaos',
] as const

export type LabId = (typeof LAB_IDS)[number]

export type LabConfig = {
  id: LabId
  name: string
  description: string
  color: string
  emoji: string
  openingPrompt: string
}

export const LABS: LabConfig[] = [
  {
    id: 'startup',
    name: 'Startup Lab',
    description: 'Business ideas and product concepts',
    color: '#6366f1',
    emoji: 'Rocket',
    openingPrompt:
      "What's something you've complained about more than three times that nobody's built a solution for yet?",
  },
  {
    id: 'story',
    name: 'Story Lab',
    description: 'Narrative fragments and world-building',
    color: '#ec4899',
    emoji: 'Book',
    openingPrompt:
      'Give your protagonist one flaw that makes them hard to root for but impossible to look away from.',
  },
  {
    id: 'problem',
    name: 'Problem Lab',
    description: 'Real-world problems seeking solutions',
    color: '#f59e0b',
    emoji: 'Search',
    openingPrompt:
      "What's a problem everyone has but nobody talks about like it's a real problem?",
  },
  {
    id: 'music',
    name: 'Music Lab',
    description: 'Sound, structure, and sonic ideas',
    color: '#10b981',
    emoji: 'Music',
    openingPrompt: 'What emotion has never had its perfect song written for it yet?',
  },
  {
    id: 'invention',
    name: 'Invention Lab',
    description: 'Physical products and systems',
    color: '#3b82f6',
    emoji: 'Cog',
    openingPrompt:
      "What's something we build the same way we've always built it despite obviously better options existing?",
  },
  {
    id: 'marketing',
    name: 'Marketing Lab',
    description: 'Campaigns, brands, and cultural angles',
    color: '#8b5cf6',
    emoji: 'Megaphone',
    openingPrompt: 'What brand would you actually trust if it existed?',
  },
  {
    id: 'popculture',
    name: 'Pop Culture Lab',
    description: 'Film, TV, trends, and cultural moments',
    color: '#ef4444',
    emoji: 'Clapperboard',
    openingPrompt:
      "What's a movie everyone agrees is good for the wrong reasons?",
  },
  {
    id: 'research',
    name: 'Research Lab',
    description: 'Science, history, philosophy, and inquiry',
    color: '#14b8a6',
    emoji: 'Microscope',
    openingPrompt:
      'What question is hiding inside a question everyone thinks is already answered?',
  },
  {
    id: 'chaos',
    name: 'Chaos Lab',
    description: 'Weird, funny, absurd, and experimental',
    color: '#f97316',
    emoji: 'Sparkles',
    openingPrompt:
      "What's a business that absolutely should not exist but would definitely make money?",
  },
]

export const LAB_MAP = Object.fromEntries(
  LABS.map((lab) => [lab.id, lab])
) as Record<LabId, LabConfig>

export const ROOM_ROLE_OPTIONS = [
  'Developer',
  'Designer',
  'Writer',
  'Researcher',
  'Marketer',
  'Builder',
  'Artist',
  'Strategist',
] as const

export const RELATIONSHIP_TYPES = [
  'solves',
  'expands',
  'contradicts',
  'metaphor_for',
  'version_of',
  'completes',
  'combines',
] as const

export const RELATIONSHIP_COLORS: Record<
  (typeof RELATIONSHIP_TYPES)[number],
  string
> = {
  solves: '#10b981',
  expands: '#6366f1',
  contradicts: '#ef4444',
  metaphor_for: '#f59e0b',
  version_of: '#8b5cf6',
  completes: '#3b82f6',
  combines: '#ec4899',
}

export function isLabId(value: string): value is LabId {
  return LAB_IDS.includes(value as LabId)
}
