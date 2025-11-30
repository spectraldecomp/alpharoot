import { WOODLAND_BOARD_DEFINITION } from './boardDefinition'
import {
  BuildingInstance,
  BuildingType,
  DecreeCard,
  DecreeColumn,
  FactionId,
  GameState,
  MARQUISE_BUILDING_TRACKS,
  Suit,
  TokenInstance,
  TokenType,
  DEFAULT_ROOST_TRACK,
  DECREE_COLUMNS,
  DEFAULT_SYMPATHY_TRACK,
} from './schema'
import { recomputeDerivedGameState } from './scenarioState'

const cloneState = (state: GameState): GameState => JSON.parse(JSON.stringify(state)) as GameState

const clearingIndex = new Map(WOODLAND_BOARD_DEFINITION.clearings.map(clearing => [clearing.id, clearing]))

const SYMPATHY_SPREAD_COST = [1, 1, 2, 2, 2, 3, 3, 3, 4, 4]

const assertClearingExists = (id: string) => {
  const clearing = clearingIndex.get(id)
  if (!clearing) {
    throw new Error(`Clearing ${id} does not exist on this board`)
  }
  return clearing
}

const ensureAdjacent = (from: string, to: string) => {
  const definition = assertClearingExists(from)
  if (!definition.adjacentClearings.includes(to)) {
    throw new Error(`Clearing ${from} is not adjacent to ${to}`)
  }
}

const ensureBuildingSlot = (state: GameState, clearingId: string) => {
  const clearingDefinition = assertClearingExists(clearingId)
  const clearingState = state.board.clearings[clearingId]
  if (!clearingState) {
    throw new Error(`Clearing state missing for ${clearingId}`)
  }
  if (clearingState.buildings.length >= clearingDefinition.buildingSlots) {
    throw new Error(`No available building slots in clearing ${clearingId}`)
  }
  return clearingState
}

const nextId = (prefix: string, existing: number) => `${prefix}_${Date.now()}_${existing}`

const addDecreeCard = (state: GameState, column: DecreeColumn, card: Omit<DecreeCard, 'id'> & { id?: string }) => {
  state.factions.eyrie.decree.columns[column].push({
    id: card.id ?? nextId(`decree_${column}`, state.factions.eyrie.decree.columns[column].length),
    suit: card.suit,
    source: card.source,
  })
}

export type MoveActionRequest = {
  state: GameState
  faction: FactionId
  from: string
  to: string
  warriors: number
}

export type MoveActionResponse = {
  state: GameState
  moved: number
}

export const executeMoveAction = ({ state, faction, from, to, warriors }: MoveActionRequest): MoveActionResponse => {
  if (warriors <= 0) {
    throw new Error('You must move at least one warrior')
  }
  ensureAdjacent(from, to)
  const nextState = cloneState(state)
  const fromClearing = nextState.board.clearings[from]
  const toClearing = nextState.board.clearings[to]
  if (!fromClearing || !toClearing) {
    throw new Error('Clearing state missing for move')
  }
  const available = fromClearing.warriors[faction] ?? 0
  if (available < warriors) {
    throw new Error(`Not enough ${faction} warriors in ${from} (have ${available}, need ${warriors})`)
  }
  fromClearing.warriors[faction] = available - warriors
  toClearing.warriors[faction] = (toClearing.warriors[faction] ?? 0) + warriors
  if (fromClearing.warriors[faction] === 0) {
    delete fromClearing.warriors[faction]
  }
  recomputeDerivedGameState(nextState)
  return { state: nextState, moved: warriors }
}

export type BattleActionRequest = {
  state: GameState
  clearingId: string
  attacker: FactionId
  defender: FactionId
}

export type BattleActionResponse = {
  state: GameState
  dice: [number, number]
  attackerHits: number
  defenderHits: number
  attackerRolledHits: number
  defenderRolledHits: number
  attackerExtraHits: number
  defenderExtraHits: number
  defenderWarriorsRemoved: number
  attackerWarriorsRemoved: number
  defenderBuildingsRemoved: BuildingInstance[]
  attackerBuildingsRemoved: BuildingInstance[]
  defenderTokensRemoved: TokenInstance[]
  attackerTokensRemoved: TokenInstance[]
  victoryPointsEarned: { attacker: number; defender: number }
}

const rollBattleDice = (): [number, number] => {
  const die = () => Math.floor(Math.random() * 4)
  return [die(), die()]
}

export const executeBattleAction = ({
  state,
  clearingId,
  attacker,
  defender,
}: BattleActionRequest): BattleActionResponse => {
  const nextState = cloneState(state)
  const clearing = nextState.board.clearings[clearingId]
  if (!clearing) {
    throw new Error(`Clearing ${clearingId} not found`)
  }
  
  const attackerWarriors = clearing.warriors[attacker] ?? 0
  const defenderWarriors = clearing.warriors[defender] ?? 0
  
  if (attackerWarriors === 0) {
    throw new Error('Attacker must have warriors in the clearing to battle')
  }

  // Step 1: Ambush (not implemented yet - would require card system)
  
  // Step 2: Roll Dice and Add Extra Hits
  const dice = rollBattleDice()
  const higherRoll = Math.max(dice[0], dice[1])
  const lowerRoll = Math.min(dice[0], dice[1])
  
  // Maximum rolled hits limited by warrior count
  const attackerRolledHits = Math.min(higherRoll, attackerWarriors)
  const defenderRolledHits = Math.min(lowerRoll, defenderWarriors)
  
  // Extra hits (not from dice)
  let attackerExtraHits = 0
  const defenderExtraHits = 0
  
  // Defenseless rule: If defender has no warriors, attacker gets +1 hit
  if (defenderWarriors === 0) {
    attackerExtraHits += 1
  }
  
  const attackerTotalHits = attackerRolledHits + attackerExtraHits
  const defenderTotalHits = defenderRolledHits + defenderExtraHits
  
  // Step 3: Deal Hits Simultaneously
  // Each player chooses which pieces to remove (warriors first, then buildings/tokens)
  
  // Apply hits to defender
  const defenderResults = applyHits(clearing, defender, attackerTotalHits)
  
  // Apply hits to attacker
  const attackerResults = applyHits(clearing, attacker, defenderTotalHits)
  
  // Award victory points for destroyed buildings and tokens
  let attackerVP = 0
  let defenderVP = 0
  
  attackerVP += defenderResults.buildingsRemoved.length + defenderResults.tokensRemoved.length
  defenderVP += attackerResults.buildingsRemoved.length + attackerResults.tokensRemoved.length
  
  // Update victory track
  nextState.victoryTrack[attacker] = Math.min(30, nextState.victoryTrack[attacker] + attackerVP)
  nextState.victoryTrack[defender] = Math.min(30, nextState.victoryTrack[defender] + defenderVP)
  
  recomputeDerivedGameState(nextState)
  
  return {
    state: nextState,
    dice,
    attackerHits: attackerTotalHits,
    defenderHits: defenderTotalHits,
    attackerRolledHits,
    defenderRolledHits,
    attackerExtraHits,
    defenderExtraHits,
    defenderWarriorsRemoved: defenderResults.warriorsRemoved,
    attackerWarriorsRemoved: attackerResults.warriorsRemoved,
    defenderBuildingsRemoved: defenderResults.buildingsRemoved,
    attackerBuildingsRemoved: attackerResults.buildingsRemoved,
    defenderTokensRemoved: defenderResults.tokensRemoved,
    attackerTokensRemoved: attackerResults.tokensRemoved,
    victoryPointsEarned: { attacker: attackerVP, defender: defenderVP },
  }
}

// Helper function to apply hits to a faction in a clearing
function applyHits(
  clearing: GameState['board']['clearings'][string],
  faction: FactionId,
  hits: number,
): {
  warriorsRemoved: number
  buildingsRemoved: BuildingInstance[]
  tokensRemoved: TokenInstance[]
} {
  let remainingHits = hits
  let warriorsRemoved = 0
  const buildingsRemoved: BuildingInstance[] = []
  const tokensRemoved: TokenInstance[] = []
  
  // Step 1: Remove warriors first
  const warriors = clearing.warriors[faction] ?? 0
  const warriorsToRemove = Math.min(warriors, remainingHits)
  warriorsRemoved = warriorsToRemove
  remainingHits -= warriorsToRemove
  
  clearing.warriors[faction] = warriors - warriorsToRemove
  if (clearing.warriors[faction] === 0) {
    delete clearing.warriors[faction]
  }
  
  // Step 2: Remove buildings and tokens (player's choice, but we'll remove in order)
  if (remainingHits > 0) {
    // Remove buildings
    const factionBuildings = clearing.buildings.filter(b => b.faction === faction)
    const buildingsToRemove = Math.min(factionBuildings.length, remainingHits)
    
    for (let i = 0; i < buildingsToRemove; i++) {
      const building = factionBuildings[i]
      buildingsRemoved.push(building)
      const index = clearing.buildings.findIndex(b => b.id === building.id)
      if (index !== -1) {
        clearing.buildings.splice(index, 1)
      }
    }
    
    remainingHits -= buildingsToRemove
  }
  
  if (remainingHits > 0) {
    // Remove tokens
    const factionTokens = clearing.tokens.filter(t => t.faction === faction)
    const tokensToRemove = Math.min(factionTokens.length, remainingHits)
    
    for (let i = 0; i < tokensToRemove; i++) {
      const token = factionTokens[i]
      tokensRemoved.push(token)
      const index = clearing.tokens.findIndex(t => t.id === token.id)
      if (index !== -1) {
        clearing.tokens.splice(index, 1)
      }
    }
  }
  
  return { warriorsRemoved, buildingsRemoved, tokensRemoved }
}

export type BuildActionRequest = {
  state: GameState
  faction: FactionId
  clearingId: string
  buildingType?: BuildingType
}

export type BuildActionResponse = {
  state: GameState
  building: BuildingInstance
}

const getDefaultBuildingType = (faction: FactionId, buildingType?: BuildingType): BuildingType => {
  if (faction === 'marquise') {
    if (!buildingType) throw new Error('Cats must specify which building to construct')
    if (!['sawmill', 'workshop', 'recruiter', 'keep'].includes(buildingType)) {
      throw new Error(`Invalid building type ${buildingType} for Marquise`)
    }
    return buildingType
  }
  if (faction === 'eyrie') {
    return 'roost'
  }
  if (faction === 'woodland_alliance') {
    if (!buildingType || !buildingType.startsWith('base_')) {
      throw new Error('Woodland Alliance must place a base matching the clearing suit')
    }
    return buildingType
  }
  throw new Error(`Unknown faction ${faction}`)
}

export const executeBuildAction = ({
  state,
  faction,
  clearingId,
  buildingType,
}: BuildActionRequest): BuildActionResponse => {
  const nextState = cloneState(state)
  const clearingState = ensureBuildingSlot(nextState, clearingId)
  const derivedType = getDefaultBuildingType(faction, buildingType)
  
  let victoryPointsEarned = 0
  
  // Marquise must have warriors in the clearing to build
  if (faction === 'marquise') {
    const marquiseWarriors = clearingState.warriors.marquise ?? 0
    if (marquiseWarriors === 0) {
      throw new Error('Marquise must have warriors in the clearing to build')
    }
    
    // Get building track and check wood cost
    if (derivedType === 'sawmill' || derivedType === 'workshop' || derivedType === 'recruiter') {
      const trackType = derivedType
      const track = nextState.factions.marquise.buildingTracks[trackType]
      const trackDefinition = MARQUISE_BUILDING_TRACKS[trackType]
      
      if (track.builtCount >= trackDefinition.steps.length) {
        throw new Error(`All ${trackType}s have been built`)
      }
      
      const step = trackDefinition.steps[track.builtCount]
      const woodCost = step.costWood
      victoryPointsEarned = step.victoryPoints
      
      if (nextState.factions.marquise.woodInSupply < woodCost) {
        throw new Error(`Not enough wood. Need ${woodCost}, have ${nextState.factions.marquise.woodInSupply}`)
      }
      
      // Deduct wood cost
      nextState.factions.marquise.woodInSupply -= woodCost
      
      // Award victory points
      nextState.victoryTrack.marquise += victoryPointsEarned
    }
  }
  
  if (faction === 'woodland_alliance') {
    const clearingDefinition = assertClearingExists(clearingId)
    const expectedType = `base_${clearingDefinition.suit}`
    if (derivedType !== expectedType) {
      throw new Error(`Alliance must build ${expectedType} in ${clearingId}`)
    }
  }
  
  const newBuilding: BuildingInstance = {
    id: nextId(`${faction}_${derivedType}_${clearingId}`, clearingState.buildings.length),
    faction,
    type: derivedType,
    slotIndex: clearingState.buildings.length,
  }
  clearingState.buildings.push(newBuilding)
  recomputeDerivedGameState(nextState)
  return { state: nextState, building: newBuilding }
}

export type RecruitActionRequest = {
  state: GameState
  faction: FactionId
  clearingId?: string
  warriors?: number
}

export type RecruitPlacement = {
  clearingId: string
  warriorsPlaced: number
}

export type RecruitActionResponse = {
  state: GameState
  placements: RecruitPlacement[]
  totalPlaced: number
}

export const executeRecruitAction = ({
  state,
  faction,
  clearingId,
  warriors,
}: RecruitActionRequest): RecruitActionResponse => {
  const nextState = cloneState(state)
  const placements: RecruitPlacement[] = []

  if (faction === 'marquise') {
    const recruiterEntries = Object.entries(nextState.board.clearings).filter(([, clearing]) =>
      clearing.buildings.some(b => b.faction === 'marquise' && b.type === 'recruiter'),
    )

    if (recruiterEntries.length === 0) {
      throw new Error('No recruiters on the map. Build a recruiter before recruiting.')
    }

    let available = nextState.factions.marquise.warriorsInSupply
    if (available <= 0) {
      throw new Error('No warriors left in supply.')
    }

    recruiterEntries.forEach(([id, clearing]) => {
      if (available <= 0) {
        return
      }
      const recruitersInClearing = clearing.buildings.filter(
        b => b.faction === 'marquise' && b.type === 'recruiter',
      ).length
      if (recruitersInClearing === 0) {
        return
      }
      const toPlace = Math.min(recruitersInClearing, available)
      clearing.warriors.marquise = (clearing.warriors.marquise ?? 0) + toPlace
      placements.push({ clearingId: id, warriorsPlaced: toPlace })
      available -= toPlace
    })
  } else if (faction === 'eyrie') {
    let targetClearingId = clearingId
    if (!targetClearingId) {
      const fallback = Object.entries(nextState.board.clearings).find(([, clearing]) =>
        clearing.buildings.some(b => b.faction === 'eyrie' && b.type === 'roost'),
      )
      if (!fallback) {
        throw new Error('Eyrie have no roosts to recruit from.')
      }
      targetClearingId = fallback[0]
    }
    const clearingState = nextState.board.clearings[targetClearingId]
    if (!clearingState) {
      throw new Error(`Clearing ${targetClearingId} not found`)
    }
    const hasRoost = clearingState.buildings.some(b => b.faction === 'eyrie' && b.type === 'roost')
    if (!hasRoost) {
      throw new Error('Eyrie can only recruit in clearings with a roost.')
    }
    const available = nextState.factions.eyrie.warriorsInSupply
    if (available <= 0) {
      throw new Error('No Eyrie warriors left in supply.')
    }
    const toPlace = Math.min(Math.max(1, warriors ?? 1), available)
    clearingState.warriors.eyrie = (clearingState.warriors.eyrie ?? 0) + toPlace
    placements.push({ clearingId: targetClearingId, warriorsPlaced: toPlace })
  } else if (faction === 'woodland_alliance') {
    if (!clearingId) {
      throw new Error('Woodland Alliance recruits must specify a base clearing.')
    }
    const clearingState = nextState.board.clearings[clearingId]
    if (!clearingState) {
      throw new Error(`Clearing ${clearingId} not found`)
    }
    const hasBase = clearingState.buildings.some(
      b => b.faction === 'woodland_alliance' && b.type.startsWith('base_'),
    )
    if (!hasBase) {
      throw new Error('Alliance can only recruit in clearings with one of their bases.')
    }
    const available = nextState.factions.woodland_alliance.warriorsInSupply
    if (available <= 0) {
      throw new Error('No Woodland Alliance warriors left in supply.')
    }
    const toPlace = 1
    clearingState.warriors.woodland_alliance = (clearingState.warriors.woodland_alliance ?? 0) + toPlace
    placements.push({ clearingId, warriorsPlaced: toPlace })
  } else {
    throw new Error(`Recruit not implemented for faction ${faction}`)
  }

  if (placements.length === 0) {
    throw new Error('Recruit action could not place any warriors.')
  }

  recomputeDerivedGameState(nextState)
  return {
    state: nextState,
    placements,
    totalPlaced: placements.reduce((sum, entry) => sum + entry.warriorsPlaced, 0),
  }
}

export type TokenActionRequest = {
  state: GameState
  faction: FactionId
  clearingId: string
  tokenType: TokenType
}

export type TokenActionResponse = {
  state: GameState
  token: TokenInstance
}

export const executeTokenPlacement = ({
  state,
  faction,
  clearingId,
  tokenType,
}: TokenActionRequest): TokenActionResponse => {
  if (tokenType === 'sympathy' && faction !== 'woodland_alliance') {
    throw new Error('Only the Woodland Alliance can place sympathy tokens')
  }
  const nextState = cloneState(state)
  const clearingState = nextState.board.clearings[clearingId]
  if (!clearingState) {
    throw new Error(`Clearing ${clearingId} not found`)
  }
  if (
    faction === 'woodland_alliance' &&
    tokenType === 'sympathy' &&
    clearingState.tokens.some(token => token.faction === 'woodland_alliance' && token.type === 'sympathy')
  ) {
    throw new Error('Clearing already has a sympathy token')
  }

  if (faction === 'woodland_alliance' && tokenType === 'sympathy') {
    const clearingDefinition = assertClearingExists(clearingId)
    const supporters = nextState.factions.woodland_alliance.supporters
    const tokensPlaced = nextState.factions.woodland_alliance.sympathyTrack.sympathyPlaced
    const baseCost = SYMPATHY_SPREAD_COST[Math.min(tokensPlaced, SYMPATHY_SPREAD_COST.length - 1)]
    const hasMartialLaw = Object.entries(clearingState.warriors).some(
      ([factionId, count]) => factionId !== 'woodland_alliance' && (count ?? 0) >= 3,
    )
    const requiredSupporters = baseCost + (hasMartialLaw ? 1 : 0)
    const targetSuit: keyof typeof supporters =
      clearingDefinition.suit === 'mouse' ||
      clearingDefinition.suit === 'rabbit' ||
      clearingDefinition.suit === 'fox'
        ? (clearingDefinition.suit as 'mouse' | 'rabbit' | 'fox')
        : 'bird'
    const spendSupporters = (suit: keyof typeof supporters, amount: number) => {
      if (amount <= 0) return
      if (supporters[suit] < amount) {
        throw new Error('Not enough supporters to spread sympathy in that clearing.')
      }
      supporters[suit] -= amount
    }
    if (requiredSupporters > 0) {
      if (targetSuit === 'bird') {
        spendSupporters('bird', requiredSupporters)
      } else {
        const primary = Math.min(requiredSupporters, supporters[targetSuit])
        spendSupporters(targetSuit, primary)
        const remainder = requiredSupporters - primary
        if (remainder > 0) {
          spendSupporters('bird', remainder)
        }
      }
    }

    const sympathyIndex = Math.min(
      DEFAULT_SYMPATHY_TRACK.steps.length - 1,
      nextState.factions.woodland_alliance.sympathyTrack.sympathyPlaced,
    )
    const vp = DEFAULT_SYMPATHY_TRACK.steps[sympathyIndex]?.victoryPoints ?? 0
    if (vp > 0) {
      nextState.victoryTrack.woodland_alliance = Math.min(30, nextState.victoryTrack.woodland_alliance + vp)
    }
  }
  const token: TokenInstance = {
    id: nextId(`${faction}_${tokenType}_${clearingId}`, clearingState.tokens.length),
    faction,
    type: tokenType,
  }
  clearingState.tokens.push(token)
  recomputeDerivedGameState(nextState)
  return { state: nextState, token }
}

export type PlaceWoodActionRequest = {
  state: GameState
  clearingId: string
}

export type PlaceWoodActionResponse = {
  state: GameState
  token: TokenInstance
}

export const executePlaceWoodAction = ({ state, clearingId }: PlaceWoodActionRequest): PlaceWoodActionResponse => {
  const nextState = cloneState(state)
  const clearingState = nextState.board.clearings[clearingId]
  if (!clearingState) {
    throw new Error(`Clearing ${clearingId} not found`)
  }

  const sawmillCount = clearingState.buildings.filter(b => b.faction === 'marquise' && b.type === 'sawmill').length
  if (sawmillCount === 0) {
    throw new Error('Wood can only be placed in clearings that contain a Marquise sawmill')
  }

  if (nextState.factions.marquise.woodInSupply <= 0) {
    throw new Error('No wood remaining in Marquise supply')
  }

  const token: TokenInstance = {
    id: nextId(`marquise_wood_${clearingId}`, clearingState.tokens.length),
    faction: 'marquise',
    type: 'wood',
  }

  clearingState.tokens.push(token)
  nextState.factions.marquise.woodInSupply = Math.max(0, nextState.factions.marquise.woodInSupply - 1)
  recomputeDerivedGameState(nextState)

  return { state: nextState, token }
}

export const performEyrieBirdsong = (state: GameState): { state: GameState; log: string[] } => {
  const nextState = cloneState(state)
  const log: string[] = []
  const eyrie = nextState.factions.eyrie
  const nonBirdSuits: Suit[] = ['fox', 'rabbit', 'mouse']

  if (eyrie.handSize <= 0) {
    eyrie.handSize = 1
    log.push('Emergency Orders: drew 1 card.')
  }

  let cardsAdded = 0
  const cardsToAdd = Math.min(2, eyrie.handSize)
  let birdAdded = false
  for (let i = 0; i < cardsToAdd; i += 1) {
    const targetColumn = DECREE_COLUMNS.reduce((best, column) => {
      if (!best) return column
      const length = eyrie.decree.columns[column].length
      const bestLength = eyrie.decree.columns[best].length
      if (length < bestLength) return column
      return best
    }, DECREE_COLUMNS[0])

    let suit: Suit
    if (!birdAdded) {
      suit = 'bird'
      birdAdded = true
    } else {
      const idx = (cardsAdded - 1) % nonBirdSuits.length
      suit = nonBirdSuits[idx]
    }

    addDecreeCard(nextState, targetColumn, { suit, source: 'normal' })
    eyrie.handSize = Math.max(0, eyrie.handSize - 1)
    cardsAdded += 1
    log.push(`Added a ${suit} card to the ${targetColumn} column of the Decree.`)
  }

  if (eyrie.roostsOnMap === 0) {
    const candidate = Object.entries(nextState.board.clearings)
      .map(([id, clearing]) => {
        const totalWarriors = Object.values(clearing.warriors).reduce((sum, value) => sum + (value ?? 0), 0)
        return { id, clearing, totalWarriors }
      })
      .filter(entry => {
        const clearingDef = assertClearingExists(entry.id)
        return entry.clearing.buildings.length < clearingDef.buildingSlots
      })
      .sort((a, b) => a.totalWarriors - b.totalWarriors)[0]

    if (candidate) {
      const targetClearing = nextState.board.clearings[candidate.id]
      const building: BuildingInstance = {
        id: nextId(`eyrie_roost_${candidate.id}`, targetClearing.buildings.length),
        faction: 'eyrie',
        type: 'roost',
        slotIndex: targetClearing.buildings.length,
      }
      targetClearing.buildings.push(building)
      const warriorsToPlace = Math.min(3, eyrie.warriorsInSupply)
      targetClearing.warriors.eyrie = (targetClearing.warriors.eyrie ?? 0) + warriorsToPlace
      log.push(`A New Roost: placed a roost with ${warriorsToPlace} warriors in ${candidate.id.toUpperCase()}.`)
    }
  }

  recomputeDerivedGameState(nextState)
  if (cardsAdded === 0 && log.length === 0) {
    log.push('Birdsong complete: no changes required.')
  }
  return { state: nextState, log }
}

export const performEyrieEvening = (state: GameState): { state: GameState; log: string[] } => {
  const nextState = cloneState(state)
  const log: string[] = []
  const eyrie = nextState.factions.eyrie
  const roostIndex = Math.min(
    DEFAULT_ROOST_TRACK.steps.length - 1,
    Math.max(0, eyrie.roostTrack.roostsPlaced),
  )
  const vp = DEFAULT_ROOST_TRACK.steps[roostIndex]?.victoryPoints ?? 0
  if (vp > 0) {
    nextState.victoryTrack.eyrie = Math.min(30, nextState.victoryTrack.eyrie + vp)
    log.push(`Scored ${vp} VP from roost track (total ${nextState.victoryTrack.eyrie}).`)
  } else {
    log.push('Scored 0 VP from roost track.')
  }

  eyrie.handSize += 1
  log.push(`Drew 1 card in Evening (hand size ${eyrie.handSize}).`)
  recomputeDerivedGameState(nextState)
  return { state: nextState, log }
}

export const triggerEyrieTurmoil = (state: GameState): { state: GameState; lostPoints: number } => {
  const nextState = cloneState(state)
  const eyrie = nextState.factions.eyrie
  const birdCards = DECREE_COLUMNS.reduce(
    (sum, column) =>
      sum +
      eyrie.decree.columns[column].filter(card => card.suit === 'bird').length,
    0,
  )
  if (birdCards > 0) {
    nextState.victoryTrack.eyrie = Math.max(0, nextState.victoryTrack.eyrie - birdCards)
  }
  DECREE_COLUMNS.forEach(column => {
    eyrie.decree.columns[column] = eyrie.decree.columns[column].filter(card => card.source === 'vizier')
  })
  nextState.turn.phase = 'evening'
  recomputeDerivedGameState(nextState)
  return { state: nextState, lostPoints: birdCards }
}

export type GameInfoSummary = {
  turn: GameState['turn']
  victoryTrack: GameState['victoryTrack']
  factionSupplies: {
    faction: FactionId
    warriors: number
    resources: Record<string, number | Record<string, number>>
  }[]
  clearings: {
    id: string
    suit: string
    warriors: Partial<Record<FactionId, number>>
    buildings: string[]
    tokens: string[]
  }[]
}

export const summarizeGameState = (state: GameState): GameInfoSummary => ({
  turn: state.turn,
  victoryTrack: state.victoryTrack,
  factionSupplies: [
    {
      faction: 'marquise',
      warriors: state.factions.marquise.warriorsInSupply,
      resources: {
        wood: state.factions.marquise.woodInSupply,
        sawmills: state.factions.marquise.totalSawmillsOnMap,
        workshops: state.factions.marquise.totalWorkshopsOnMap,
        recruiters: state.factions.marquise.totalRecruitersOnMap,
      },
    },
    {
      faction: 'eyrie',
      warriors: state.factions.eyrie.warriorsInSupply,
      resources: {
        roosts: state.factions.eyrie.roostsOnMap,
        decree: (Object.keys(state.factions.eyrie.decree.columns) as DecreeColumn[]).reduce(
          (acc, column) => ({ ...acc, [column]: state.factions.eyrie.decree.columns[column].length }),
          {} as Record<string, number>,
        ),
      },
    },
    {
      faction: 'woodland_alliance',
      warriors: state.factions.woodland_alliance.warriorsInSupply,
      resources: {
        officers: state.factions.woodland_alliance.officers,
        sympathy: state.factions.woodland_alliance.sympathyOnMap,
      },
    },
  ],
  clearings: WOODLAND_BOARD_DEFINITION.clearings.map(def => {
    const clearingState = state.board.clearings[def.id]
    return {
      id: def.id,
      suit: def.suit,
      warriors: clearingState?.warriors ?? {},
      buildings: clearingState?.buildings.map(building => `${building.faction}:${building.type}`) ?? [],
      tokens: clearingState?.tokens.map(token => `${token.faction}:${token.type}`) ?? [],
    }
  }),
})

