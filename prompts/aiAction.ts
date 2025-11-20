import { GameState, FactionId } from '@/gameState/schema'
import { summarizeGameState } from '@/gameState/actions'
import { PlayerProfile } from '@/constants/scenarios'

export type AIActionDecision = 
  | { type: 'move'; from: string; to: string; warriors: number }
  | { type: 'battle'; clearingId: string; defender: FactionId }
  | { type: 'build'; clearingId: string; buildingType?: string }
  | { type: 'recruit'; clearingId: string; warriors: number }
  | { type: 'pass' } // Skip this phase/turn

export const AI_ACTION_DECISION_PROMPT = (
  faction: FactionId,
  gameState: GameState,
  profile: PlayerProfile
) => {
  const boardSummary = summarizeGameState(gameState)
  const currentFaction = gameState.turn.currentFaction
  const currentPhase = gameState.turn.phase
  
  const factionInfo = faction === 'eyrie' 
    ? `Eyrie Dynasties:
- Warriors in supply: ${gameState.factions.eyrie.warriorsInSupply}
- Roosts on map: ${gameState.factions.eyrie.roostsOnMap}
- Decree columns: ${JSON.stringify(Object.keys(gameState.factions.eyrie.decree.columns).map(col => `${col}: ${gameState.factions.eyrie.decree.columns[col as keyof typeof gameState.factions.eyrie.decree.columns].length} cards`))}
- VP: ${gameState.victoryTrack.eyrie}`
    : `Woodland Alliance:
- Warriors in supply: ${gameState.factions.woodland_alliance.warriorsInSupply}
- Officers: ${gameState.factions.woodland_alliance.officers}
- Sympathy on map: ${gameState.factions.woodland_alliance.sympathyOnMap}
- Bases: ${Object.entries(gameState.factions.woodland_alliance.bases).filter(([, v]) => v).map(([k]) => k).join(', ') || 'None'}
- VP: ${gameState.victoryTrack.woodland_alliance}`

  // Get available clearings for actions
  const clearingsWithWarriors = Object.entries(gameState.board.clearings)
    .filter(([, clearing]) => (clearing.warriors[faction] ?? 0) > 0)
    .map(([id]) => id)

  return `
You are an AI player controlling the ${faction === 'eyrie' ? 'Eyrie Dynasties' : 'Woodland Alliance'} faction in Root, a strategic board game.

## Current Game State
- Current Faction Turn: ${currentFaction}
- Current Phase: ${currentPhase}
- Round: ${gameState.turn.roundNumber}

## Your Faction Status
${factionInfo}

## Board State Summary
${JSON.stringify(boardSummary, null, 2).substring(0, 2000)}...

## Your Clearings with Warriors
${clearingsWithWarriors.join(', ') || 'None'}

## Your Player Profile
- Proficiency Level: ${profile.proficiencyLevel}
- Play Style: ${profile.playStyle}

## Available Actions
Based on the current phase (${currentPhase}), you can:
${currentPhase === 'daylight' ? `- Move: Move warriors between adjacent clearings (you have warriors in: ${clearingsWithWarriors.join(', ') || 'none'})
- Battle: Attack enemy factions in clearings where you have warriors
- Build: ${faction === 'eyrie' ? 'Build roosts in clearings you control' : 'Build bases in clearings with sympathy (if you have enough supporters)'}
- Recruit: ${faction === 'eyrie' ? 'Recruit warriors (if decree requires)' : 'Recruit officers in clearings with bases'}
- Pass: Skip remaining actions and advance phase` : currentPhase === 'birdsong' ? '- Faction-specific setup actions' : '- End of turn actions'}

## Decision Rules
1. Make strategic decisions based on your play style (${profile.playStyle}) and proficiency level (${profile.proficiencyLevel})
2. ${faction === 'eyrie' ? 'Consider your Decree - you should try to fulfill decree actions when possible' : 'Consider your sympathy track and base placement strategy'}
3. Victory points matter - you need 30 to win (currently at ${gameState.victoryTrack[faction]})
4. Be aware of enemy positions and threats
5. If no valid actions are available or strategically sound, choose "pass"
6. Keep actions simple and focused

## Response Format
Respond with a JSON object in this exact format:
{
  "action": {
    "type": "move" | "battle" | "build" | "recruit" | "pass",
    "from": "clearing_id" (required for move, e.g. "c1", "c2"),
    "to": "clearing_id" (required for move),
    "warriors": number (required for move/recruit, must be > 0),
    "clearingId": "clearing_id" (required for battle/build/recruit),
    "defender": "marquise" | "eyrie" | "woodland_alliance" (required for battle),
    "buildingType": "building_type" (optional for build, e.g. "roost" for eyrie, "base_mouse" for alliance)
  },
  "reasoning": "Brief 1-2 sentence explanation of why you chose this action"
}

Important: 
- Only return valid JSON
- Clearing IDs are like "c1", "c2", "c3", etc.
- Faction IDs are "marquise", "eyrie", "woodland_alliance"
- If choosing "pass", you can omit other fields
- Make sure the action is valid (e.g., clearings are adjacent for move, you have warriors in the clearing for battle)
`.trim()
}

