export const FACTIONS = ['marquise', 'eyrie', 'woodland_alliance'] as const
export type FactionId = (typeof FACTIONS)[number]

export const SUITS = ['fox', 'rabbit', 'mouse', 'bird', 'none'] as const
export type Suit = (typeof SUITS)[number]

export const PHASES = ['birdsong', 'daylight', 'evening'] as const
export type Phase = (typeof PHASES)[number]

export interface TurnState {
  currentFaction: FactionId
  phase: Phase
  actionSubstep?: string
  roundNumber: number
}

export type PedagogicalState = Record<string, never>

export interface GameState {
  board: BoardState
  factions: {
    marquise: MarquiseState
    eyrie: EyrieState
    woodland_alliance: WoodlandAllianceState
  }
  victoryTrack: Record<FactionId, number>
  turn: TurnState
  pedagogy?: PedagogicalState
}

export interface BoardDefinition {
  clearings: ClearingDefinition[]
}

export interface ClearingDefinition {
  id: string
  suit: Suit
  buildingSlots: number
  adjacentClearings: string[]
  x?: number
  y?: number
}

export interface BoardState {
  clearings: Record<string, ClearingState>
}

export interface ClearingState {
  id: string
  warriors: Partial<Record<FactionId, number>>
  buildings: BuildingInstance[]
  tokens: TokenInstance[]
}

export const BUILDING_TYPES = [
  'sawmill',
  'workshop',
  'recruiter',
  'roost',
  'base_mouse',
  'base_rabbit',
  'base_fox',
  'keep',
] as const

export type BuildingType = (typeof BUILDING_TYPES)[number]

export interface BuildingInstance {
  id: string
  faction: FactionId
  type: BuildingType
  slotIndex: number
}

export const TOKEN_TYPES = ['wood', 'sympathy', 'other'] as const
export type TokenType = (typeof TOKEN_TYPES)[number]

export interface TokenInstance {
  id: string
  faction: FactionId
  type: TokenType
}

export interface BuildingTrackStep {
  costWood: number
  victoryPoints: number
}

export interface BuildingTrackDefinition {
  type: 'sawmill' | 'workshop' | 'recruiter'
  steps: BuildingTrackStep[]
}

export interface BuildingTrackStatus {
  definitionId: string
  builtCount: number
}

export interface MarquiseState {
  faction: 'marquise'
  warriorsInSupply: number
  woodInSupply: number
  buildingTracks: {
    sawmill: BuildingTrackStatus
    workshop: BuildingTrackStatus
    recruiter: BuildingTrackStatus
  }
  totalSawmillsOnMap: number
  totalWorkshopsOnMap: number
  totalRecruitersOnMap: number
}

export const DECREE_COLUMNS = ['recruit', 'move', 'battle', 'build'] as const
export type DecreeColumn = (typeof DECREE_COLUMNS)[number]

export interface DecreeCard {
  suit: Suit
  source: 'vizier' | 'normal'
  id: string
}

export interface DecreeState {
  columns: Record<DecreeColumn, DecreeCard[]>
  lastResolutionResult?: {
    column: DecreeColumn
    cardId: string
    success: boolean
    reasonIfFail?: string
  }[]
}

export interface RoostTrackStep {
  victoryPoints: number
}

export interface RoostTrackDefinition {
  steps: RoostTrackStep[]
}

export interface RoostTrackStatus {
  definitionId: string
  roostsPlaced: number
}

export interface EyrieState {
  faction: 'eyrie'
  warriorsInSupply: number
  decree: DecreeState
  roostTrack: RoostTrackStatus
  roostsOnMap: number
  handSize: number
}

export interface SympathyTrackStep {
  victoryPoints: number
}

export interface SympathyTrackDefinition {
  steps: SympathyTrackStep[]
}

export interface SympathyTrackStatus {
  definitionId: string
  sympathyPlaced: number
}

export interface WoodlandAllianceState {
  faction: 'woodland_alliance'
  warriorsInSupply: number
  bases: {
    mouse: boolean
    rabbit: boolean
    fox: boolean
  }
  officers: number
  sympathyTrack: SympathyTrackStatus
  sympathyOnMap: number
  supporters: {
    mouse: number
    rabbit: number
    fox: number
    bird: number
  }
}

export const MARQUISE_TOTAL_WARRIORS = 25
export const MARQUISE_TOTAL_WOOD = 8
export const EYRIE_TOTAL_WARRIORS = 20
export const WOODLAND_ALLIANCE_TOTAL_WARRIORS = 10

export const MARQUISE_BUILDING_TRACKS: Record<'sawmill' | 'workshop' | 'recruiter', BuildingTrackDefinition> = {
  sawmill: {
    type: 'sawmill',
    steps: [
      { costWood: 0, victoryPoints: 1 },
      { costWood: 1, victoryPoints: 2 },
      { costWood: 2, victoryPoints: 2 },
      { costWood: 3, victoryPoints: 3 },
      { costWood: 3, victoryPoints: 4 },
      { costWood: 4, victoryPoints: 5 },
    ],
  },
  workshop: {
    type: 'workshop',
    steps: [
      { costWood: 0, victoryPoints: 1 },
      { costWood: 1, victoryPoints: 2 },
      { costWood: 2, victoryPoints: 2 },
      { costWood: 3, victoryPoints: 3 },
      { costWood: 3, victoryPoints: 4 },
      { costWood: 4, victoryPoints: 5 },
    ],
  },
  recruiter: {
    type: 'recruiter',
    steps: [
      { costWood: 0, victoryPoints: 1 },
      { costWood: 1, victoryPoints: 2 },
      { costWood: 2, victoryPoints: 2 },
      { costWood: 3, victoryPoints: 3 },
      { costWood: 3, victoryPoints: 3 },
      { costWood: 4, victoryPoints: 4 },
    ],
  },
}

export const DEFAULT_ROOST_TRACK: RoostTrackDefinition = {
  steps: [
    { victoryPoints: 0 },
    { victoryPoints: 1 },
    { victoryPoints: 2 },
    { victoryPoints: 3 },
    { victoryPoints: 4 },
    { victoryPoints: 5 },
    { victoryPoints: 7 },
  ],
}

export const DEFAULT_SYMPATHY_TRACK: SympathyTrackDefinition = {
  steps: [
    { victoryPoints: 0 },
    { victoryPoints: 0 },
    { victoryPoints: 1 },
    { victoryPoints: 1 },
    { victoryPoints: 2 },
    { victoryPoints: 2 },
    { victoryPoints: 3 },
    { victoryPoints: 3 },
    { victoryPoints: 4 },
    { victoryPoints: 4 },
  ],
}