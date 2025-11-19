import { WOODLAND_BOARD_DEFINITION } from './boardDefinition'
import {
  BuildingInstance,
  BuildingType,
  DecreeColumn,
  FactionId,
  GameState,
  MARQUISE_BUILDING_TRACKS,
  TokenInstance,
  TokenType,
} from './schema'
import { recomputeDerivedGameState } from './scenarioState'

const cloneState = (state: GameState): GameState => JSON.parse(JSON.stringify(state)) as GameState

const clearingIndex = new Map(WOODLAND_BOARD_DEFINITION.clearings.map(clearing => [clearing.id, clearing]))

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
  let attackerRolledHits = Math.min(higherRoll, attackerWarriors)
  let defenderRolledHits = Math.min(lowerRoll, defenderWarriors)
  
  // Extra hits (not from dice)
  let attackerExtraHits = 0
  let defenderExtraHits = 0
  
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
  clearingId: string
  warriors: number
}

export type RecruitActionResponse = {
  state: GameState
  warriorsPlaced: number
  clearingId: string
}

export const executeRecruitAction = ({
  state,
  faction,
  clearingId,
  warriors,
}: RecruitActionRequest): RecruitActionResponse => {
  if (warriors <= 0) {
    throw new Error('Must recruit at least one warrior')
  }

  const nextState = cloneState(state)
  const clearingState = nextState.board.clearings[clearingId]
  
  if (!clearingState) {
    throw new Error(`Clearing ${clearingId} not found`)
  }

  // Marquise-specific recruit rules
  if (faction === 'marquise') {
    // Check for recruiters in the clearing
    const recruitersInClearing = clearingState.buildings.filter(
      b => b.faction === 'marquise' && b.type === 'recruiter'
    ).length

    if (recruitersInClearing === 0) {
      throw new Error('No recruiters in this clearing')
    }

    // Can only recruit up to the number of recruiters
    if (warriors > recruitersInClearing) {
      throw new Error(`Can only recruit ${recruitersInClearing} warrior(s) (one per recruiter)`)
    }

    // Check if enough warriors in supply
    if (nextState.factions.marquise.warriorsInSupply < warriors) {
      throw new Error(`Not enough warriors in supply. Need ${warriors}, have ${nextState.factions.marquise.warriorsInSupply}`)
    }

    // Place warriors
    clearingState.warriors.marquise = (clearingState.warriors.marquise ?? 0) + warriors
  } else {
    throw new Error(`Recruit not implemented for faction ${faction}`)
  }

  recomputeDerivedGameState(nextState)
  return { state: nextState, warriorsPlaced: warriors, clearingId }
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
  const token: TokenInstance = {
    id: nextId(`${faction}_${tokenType}_${clearingId}`, clearingState.tokens.length),
    faction,
    type: tokenType,
  }
  clearingState.tokens.push(token)
  recomputeDerivedGameState(nextState)
  return { state: nextState, token }
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

