export type FactionId = 'marquise' | 'eyrie' | 'woodland_alliance'

export type Suit = 'fox' | 'rabbit' | 'mouse' | 'bird' | 'none'

export type Phase = 'birdsong' | 'daylight' | 'evening'

export interface TurnState {
  currentFaction: FactionId
  phase: Phase
  actionSubstep?: string
  roundNumber: number
}

export interface PedagogicalState {
  // Placeholder
}

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

export type BuildingType =
  | 'sawmill'
  | 'workshop'
  | 'recruiter'
  | 'roost'
  | 'base_mouse'
  | 'base_rabbit'
  | 'base_fox'
  | 'keep'

export interface BuildingInstance {
  id: string
  faction: FactionId
  type: BuildingType
  slotIndex: number
}

export type TokenType = 'wood' | 'sympathy' | 'other'

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

export type DecreeColumn = 'recruit' | 'move' | 'battle' | 'build'

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
}

const MARQUISE_TOTAL_WARRIORS = 25
const MARQUISE_TOTAL_WOOD = 8
const EYRIE_TOTAL_WARRIORS = 20
const WOODLAND_ALLIANCE_TOTAL_WARRIORS = 10

const MARQUISE_TRACK_KEY = {
  sawmill: 'marquise_sawmill',
  workshop: 'marquise_workshop',
  recruiter: 'marquise_recruiter',
} as const

export type MarquiseTrackKey = (typeof MARQUISE_TRACK_KEY)[keyof typeof MARQUISE_TRACK_KEY]

const CORNER_KEYWORDS = ['nw', 'ne', 'se', 'sw'] as const
type CornerKeyword = (typeof CORNER_KEYWORDS)[number]

const OPPOSITE_CORNERS: Record<CornerKeyword, CornerKeyword> = {
  nw: 'se',
  ne: 'sw',
  se: 'nw',
  sw: 'ne',
}

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
