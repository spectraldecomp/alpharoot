import { WOODLAND_BOARD_DEFINITION } from './boardDefinition'
import {
  BoardState,
  BuildingInstance,
  BuildingType,
  ClearingState,
  DecreeCard,
  DecreeColumn,
  FactionId,
  GameState,
  MARQUISE_TOTAL_WARRIORS,
  MARQUISE_TOTAL_WOOD,
  EYRIE_TOTAL_WARRIORS,
  WOODLAND_ALLIANCE_TOTAL_WARRIORS,
  Phase,
  TokenInstance,
  TokenType,
} from './schema'

type ScenarioBuilder = () => GameState

const factionOrder: FactionId[] = ['marquise', 'eyrie', 'woodland_alliance']

const createEmptyBoardState = (): BoardState => {
  return {
    clearings: WOODLAND_BOARD_DEFINITION.clearings.reduce<Record<string, ClearingState>>((acc, clearing) => {
      acc[clearing.id] = {
        id: clearing.id,
        warriors: {},
        buildings: [],
        tokens: [],
      }
      return acc
    }, {}),
  }
}

const createEmptyDecree = (): Record<DecreeColumn, DecreeCard[]> => ({
  recruit: [],
  move: [],
  battle: [],
  build: [],
})

const createBaseGameState = (): GameState => ({
  board: createEmptyBoardState(),
  factions: {
    marquise: {
      faction: 'marquise',
      warriorsInSupply: MARQUISE_TOTAL_WARRIORS,
      woodInSupply: MARQUISE_TOTAL_WOOD,
      buildingTracks: {
        sawmill: { definitionId: 'marquise_sawmill', builtCount: 0 },
        workshop: { definitionId: 'marquise_workshop', builtCount: 0 },
        recruiter: { definitionId: 'marquise_recruiter', builtCount: 0 },
      },
      totalSawmillsOnMap: 0,
      totalWorkshopsOnMap: 0,
      totalRecruitersOnMap: 0,
    },
    eyrie: {
      faction: 'eyrie',
      warriorsInSupply: EYRIE_TOTAL_WARRIORS,
      decree: {
        columns: createEmptyDecree(),
      },
      roostTrack: { definitionId: 'default_roost_track', roostsPlaced: 0 },
      roostsOnMap: 0,
    },
    woodland_alliance: {
      faction: 'woodland_alliance',
      warriorsInSupply: WOODLAND_ALLIANCE_TOTAL_WARRIORS,
      bases: { mouse: false, rabbit: false, fox: false },
      officers: 0,
      sympathyTrack: { definitionId: 'default_sympathy_track', sympathyPlaced: 0 },
      sympathyOnMap: 0,
    },
  },
  victoryTrack: {
    marquise: 0,
    eyrie: 0,
    woodland_alliance: 0,
  },
  turn: {
    currentFaction: 'marquise',
    phase: 'birdsong',
    roundNumber: 1,
  },
})

const setWarriors = (state: GameState, clearingId: string, faction: FactionId, count: number) => {
  state.board.clearings[clearingId].warriors[faction] = count
}

const addBuilding = (state: GameState, clearingId: string, faction: FactionId, type: BuildingType) => {
  const clearing = state.board.clearings[clearingId]
  const id = `${faction}_${type}_${clearingId}_${clearing.buildings.length}`
  const slotIndex = clearing.buildings.length
  const instance: BuildingInstance = {
    id,
    faction,
    type,
    slotIndex,
  }
  clearing.buildings.push(instance)
}

const addToken = (state: GameState, clearingId: string, faction: FactionId, type: TokenType) => {
  const clearing = state.board.clearings[clearingId]
  const id = `${faction}_${type}_${clearingId}_${clearing.tokens.length}`
  const instance: TokenInstance = {
    id,
    faction,
    type,
  }
  clearing.tokens.push(instance)
}

const resetDerivedFactionData = (state: GameState) => {
  state.factions.marquise.totalRecruitersOnMap = 0
  state.factions.marquise.totalSawmillsOnMap = 0
  state.factions.marquise.totalWorkshopsOnMap = 0
  state.factions.marquise.buildingTracks.recruiter.builtCount = 0
  state.factions.marquise.buildingTracks.sawmill.builtCount = 0
  state.factions.marquise.buildingTracks.workshop.builtCount = 0

  state.factions.eyrie.roostsOnMap = 0
  state.factions.eyrie.roostTrack.roostsPlaced = 0

  state.factions.woodland_alliance.sympathyOnMap = 0
  state.factions.woodland_alliance.sympathyTrack.sympathyPlaced = 0
  state.factions.woodland_alliance.bases = { mouse: false, rabbit: false, fox: false }
}

export const recomputeDerivedGameState = (state: GameState) => {
  resetDerivedFactionData(state)
  const warriorsOnMap: Record<FactionId, number> = {
    marquise: 0,
    eyrie: 0,
    woodland_alliance: 0,
  }
  let woodOnBoard = 0

  Object.values(state.board.clearings).forEach(clearing => {
    Object.entries(clearing.warriors).forEach(([faction, value]) => {
      if (!value) return
      warriorsOnMap[faction as FactionId] += value
    })

    clearing.buildings.forEach(building => {
      if (building.faction === 'marquise') {
        if (building.type === 'sawmill') {
          state.factions.marquise.totalSawmillsOnMap += 1
          state.factions.marquise.buildingTracks.sawmill.builtCount += 1
        }
        if (building.type === 'workshop') {
          state.factions.marquise.totalWorkshopsOnMap += 1
          state.factions.marquise.buildingTracks.workshop.builtCount += 1
        }
        if (building.type === 'recruiter') {
          state.factions.marquise.totalRecruitersOnMap += 1
          state.factions.marquise.buildingTracks.recruiter.builtCount += 1
        }
        if (building.type === 'keep') {
        }
      }

      if (building.faction === 'eyrie' && building.type === 'roost') {
        state.factions.eyrie.roostsOnMap += 1
        state.factions.eyrie.roostTrack.roostsPlaced += 1
      }

      if (building.faction === 'woodland_alliance' && building.type.startsWith('base_')) {
        const suit = building.type.replace('base_', '') as 'mouse' | 'rabbit' | 'fox'
        state.factions.woodland_alliance.bases[suit] = true
      }
    })

    clearing.tokens.forEach(token => {
      if (token.faction === 'marquise' && token.type === 'wood') {
        woodOnBoard += 1
      }
      if (token.faction === 'woodland_alliance' && token.type === 'sympathy') {
        state.factions.woodland_alliance.sympathyOnMap += 1
        state.factions.woodland_alliance.sympathyTrack.sympathyPlaced += 1
      }
    })
  })

  state.factions.marquise.warriorsInSupply = Math.max(0, MARQUISE_TOTAL_WARRIORS - warriorsOnMap.marquise)
  state.factions.eyrie.warriorsInSupply = Math.max(0, EYRIE_TOTAL_WARRIORS - warriorsOnMap.eyrie)
  state.factions.woodland_alliance.warriorsInSupply = Math.max(
    0,
    WOODLAND_ALLIANCE_TOTAL_WARRIORS - warriorsOnMap.woodland_alliance
  )

  state.factions.marquise.woodInSupply = Math.max(0, MARQUISE_TOTAL_WOOD - woodOnBoard)
}

const applyScenarioCommon = (
  mutator: (state: GameState) => void,
  overrides?: {
    turn?: Partial<GameState['turn']>
    victoryTrack?: Partial<GameState['victoryTrack']>
  }
): GameState => {
  const state = createBaseGameState()
  mutator(state)
  recomputeDerivedGameState(state)

  state.turn = {
    ...state.turn,
    ...overrides?.turn,
  }

  state.victoryTrack = {
    ...state.victoryTrack,
    ...overrides?.victoryTrack,
  }

  return state
}

const addDecreeCard = (
  state: GameState,
  column: DecreeColumn,
  card: Pick<DecreeCard, 'suit' | 'source'> & { id?: string }
) => {
  state.factions.eyrie.decree.columns[column].push({
    id: card.id ?? `${column}_${card.suit}_${state.factions.eyrie.decree.columns[column].length}`,
    suit: card.suit,
    source: card.source,
  })
}

const buildEyrieDominionState: ScenarioBuilder = () =>
  applyScenarioCommon(
    state => {
      addBuilding(state, 'c1', 'marquise', 'keep')
      addBuilding(state, 'c1', 'marquise', 'recruiter')
      addBuilding(state, 'c4', 'marquise', 'sawmill')
      addBuilding(state, 'c4', 'marquise', 'workshop')
      addBuilding(state, 'c7', 'marquise', 'sawmill')
      addToken(state, 'c4', 'marquise', 'wood')
      addToken(state, 'c7', 'marquise', 'wood')

      setWarriors(state, 'c1', 'marquise', 4)
      setWarriors(state, 'c4', 'marquise', 3)
      setWarriors(state, 'c7', 'marquise', 2)
      setWarriors(state, 'c5', 'marquise', 2)

      addBuilding(state, 'c2', 'eyrie', 'roost')
      addBuilding(state, 'c5', 'eyrie', 'roost')
      addBuilding(state, 'c9', 'eyrie', 'roost')
      setWarriors(state, 'c2', 'eyrie', 4)
      setWarriors(state, 'c5', 'eyrie', 3)
      setWarriors(state, 'c9', 'eyrie', 3)

      addBuilding(state, 'c11', 'woodland_alliance', 'base_rabbit')
      setWarriors(state, 'c11', 'woodland_alliance', 2)
      addToken(state, 'c7', 'woodland_alliance', 'sympathy')
      addToken(state, 'c11', 'woodland_alliance', 'sympathy')

      state.factions.woodland_alliance.officers = 1

      addDecreeCard(state, 'recruit', { suit: 'rabbit', source: 'vizier', id: 'vizier_recruit' })
      addDecreeCard(state, 'move', { suit: 'bird', source: 'vizier', id: 'vizier_move' })
      addDecreeCard(state, 'battle', { suit: 'fox', source: 'normal' })
      addDecreeCard(state, 'build', { suit: 'mouse', source: 'normal' })
    },
    {
      turn: { currentFaction: 'eyrie', phase: 'daylight', roundNumber: 3 },
      victoryTrack: { marquise: 11, eyrie: 14, woodland_alliance: 6 },
    }
  )

const buildMartialLawState: ScenarioBuilder = () =>
  applyScenarioCommon(
    state => {
      addBuilding(state, 'c1', 'marquise', 'keep')
      addBuilding(state, 'c4', 'marquise', 'sawmill')
      addBuilding(state, 'c5', 'marquise', 'workshop')
      addBuilding(state, 'c5', 'marquise', 'recruiter')
      addBuilding(state, 'c8', 'marquise', 'sawmill')
      addBuilding(state, 'c10', 'marquise', 'sawmill')
      addBuilding(state, 'c6', 'marquise', 'recruiter')
      addBuilding(state, 'c2', 'marquise', 'workshop')
      addToken(state, 'c8', 'marquise', 'wood')
      addToken(state, 'c10', 'marquise', 'wood')

      setWarriors(state, 'c1', 'marquise', 4)
      setWarriors(state, 'c4', 'marquise', 3)
      setWarriors(state, 'c5', 'marquise', 4)
      setWarriors(state, 'c6', 'marquise', 3)
      setWarriors(state, 'c8', 'marquise', 2)
      setWarriors(state, 'c10', 'marquise', 2)

      addBuilding(state, 'c9', 'eyrie', 'roost')
      setWarriors(state, 'c9', 'eyrie', 4)
      setWarriors(state, 'c3', 'eyrie', 2)

      addBuilding(state, 'c8', 'woodland_alliance', 'base_mouse')
      setWarriors(state, 'c8', 'woodland_alliance', 3)
      addToken(state, 'c7', 'woodland_alliance', 'sympathy')
      addToken(state, 'c10', 'woodland_alliance', 'sympathy')

      state.factions.woodland_alliance.officers = 2

      addDecreeCard(state, 'recruit', { suit: 'mouse', source: 'vizier', id: 'vizier_recruit' })
      addDecreeCard(state, 'recruit', { suit: 'bird', source: 'normal' })
      addDecreeCard(state, 'move', { suit: 'rabbit', source: 'vizier', id: 'vizier_move' })
      addDecreeCard(state, 'battle', { suit: 'bird', source: 'normal' })
    },
    {
      turn: { currentFaction: 'marquise', phase: 'daylight', roundNumber: 4, actionSubstep: 'recruit' },
      victoryTrack: { marquise: 17, eyrie: 8, woodland_alliance: 5 },
    }
  )

const buildConquerorsState: ScenarioBuilder = () =>
  applyScenarioCommon(
    state => {
      addBuilding(state, 'c1', 'marquise', 'keep')
      addBuilding(state, 'c4', 'marquise', 'sawmill')
      addBuilding(state, 'c5', 'marquise', 'workshop')
      addBuilding(state, 'c7', 'marquise', 'recruiter')
      addBuilding(state, 'c8', 'marquise', 'recruiter')
      addBuilding(state, 'c11', 'marquise', 'workshop')
      addToken(state, 'c4', 'marquise', 'wood')
      addToken(state, 'c7', 'marquise', 'wood')

      setWarriors(state, 'c1', 'marquise', 3)
      setWarriors(state, 'c4', 'marquise', 3)
      setWarriors(state, 'c5', 'marquise', 2)
      setWarriors(state, 'c7', 'marquise', 2)
      setWarriors(state, 'c8', 'marquise', 2)

      addBuilding(state, 'c2', 'eyrie', 'roost')
      addBuilding(state, 'c5', 'eyrie', 'roost')
      addBuilding(state, 'c9', 'eyrie', 'roost')
      setWarriors(state, 'c2', 'eyrie', 3)
      setWarriors(state, 'c5', 'eyrie', 3)
      setWarriors(state, 'c9', 'eyrie', 4)
      setWarriors(state, 'c6', 'eyrie', 2)

      addBuilding(state, 'c8', 'woodland_alliance', 'base_mouse')
      addBuilding(state, 'c11', 'woodland_alliance', 'base_rabbit')
      setWarriors(state, 'c8', 'woodland_alliance', 3)
      setWarriors(state, 'c11', 'woodland_alliance', 3)
      addToken(state, 'c7', 'woodland_alliance', 'sympathy')
      addToken(state, 'c8', 'woodland_alliance', 'sympathy')
      addToken(state, 'c11', 'woodland_alliance', 'sympathy')

      state.factions.woodland_alliance.officers = 3

      addDecreeCard(state, 'recruit', { suit: 'fox', source: 'vizier', id: 'vizier_recruit' })
      addDecreeCard(state, 'recruit', { suit: 'mouse', source: 'normal' })
      addDecreeCard(state, 'move', { suit: 'bird', source: 'vizier', id: 'vizier_move' })
      addDecreeCard(state, 'move', { suit: 'rabbit', source: 'normal' })
      addDecreeCard(state, 'battle', { suit: 'mouse', source: 'normal' })
      addDecreeCard(state, 'build', { suit: 'bird', source: 'normal' })
    },
    {
      turn: { currentFaction: 'woodland_alliance', phase: 'daylight', roundNumber: 5, actionSubstep: 'craft' },
      victoryTrack: { marquise: 20, eyrie: 19, woodland_alliance: 16 },
    }
  )

const scenarioBuilders: Record<number, ScenarioBuilder> = {
  0: buildEyrieDominionState,
  1: buildMartialLawState,
  2: buildConquerorsState,
}

export const getScenarioGameState = (scenarioIndex: number): GameState => {
  if (scenarioIndex < 0) {
    return JSON.parse(localStorage.getItem('customGameState') ?? '') as GameState
  } else {
    const builder = scenarioBuilders[scenarioIndex] ?? buildEyrieDominionState
    return builder()
  }
}

export const getNextPhase = (phase: Phase): Phase => {
  if (phase === 'birdsong') return 'daylight'
  if (phase === 'daylight') return 'evening'
  return 'birdsong'
}

export const getNextFaction = (faction: FactionId): FactionId => {
  const currentIndex = factionOrder.indexOf(faction)
  const nextIndex = (currentIndex + 1) % factionOrder.length
  return factionOrder[nextIndex]
}
