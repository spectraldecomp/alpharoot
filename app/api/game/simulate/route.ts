import { summarizeGameState } from '@/gameState/actions'
import { WOODLAND_BOARD_DEFINITION } from '@/gameState/boardDefinition'
import { FactionId, GameState } from '@/gameState/schema'
import { apiController } from '@/utils/api-controller'
import { gptChatCompletion } from '@/utils/openai'
import { z } from 'zod'

const ActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('move'),
    from: z.string(),
    to: z.string(),
    warriors: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('battle'),
    clearingId: z.string(),
    defender: z.enum(['marquise', 'eyrie', 'woodland_alliance']),
  }),
  z.object({
    type: z.literal('build'),
    clearingId: z.string(),
    buildingType: z.string().optional(),
  }),
  z.object({
    type: z.literal('token'),
    clearingId: z.string(),
    tokenType: z.literal('sympathy'),
  }),
  z.object({
    type: z.literal('pass'),
    reason: z.string(),
  }),
])

const SimulationResponseSchema = z.object({
  action: ActionSchema,
  reasoning: z.string(),
})

export type SimulateActionRequest = {
  state: GameState
  faction: FactionId
  recentActions?: {
    action: string
  }[]
}

export type SimulateActionResponse = z.infer<typeof SimulationResponseSchema>

const buildFactionPrompt = (faction: FactionId, state: GameState, recentActions: SimulateActionRequest['recentActions']) => {
  const summary = summarizeGameState(state)
  const baseContext = `You are an experienced Root player controlling the ${faction.replace('_', ' ')} faction.

Turn: ${summary.turn.currentFaction} (${summary.turn.phase})
Round: ${summary.turn.roundNumber}
Victory track: Cats ${summary.victoryTrack.marquise} | Eyrie ${summary.victoryTrack.eyrie} | Alliance ${summary.victoryTrack.woodland_alliance}

Board summary:
${summary.clearings
  .map(
    clearing => {
      const clearingDef = WOODLAND_BOARD_DEFINITION.clearings.find(c => c.id === clearing.id)
      const buildingSlots = clearingDef?.buildingSlots ?? 0
      const currentBuildings = clearing.buildings.length
      const availableSlots = buildingSlots - currentBuildings
      return `- ${clearing.id.toUpperCase()} (${clearing.suit}) | Warriors ${JSON.stringify(
        clearing.warriors,
      )} | Buildings ${clearing.buildings.join(', ') || 'none'} (${currentBuildings}/${buildingSlots} slots used, ${availableSlots} available) | Tokens ${clearing.tokens.join(', ') || 'none'}`
    }
  )
  .join('\n')}`

  const factionSpecific = (() => {
    if (faction === 'eyrie') {
      return `Your actions must respect the Decree structure (recruit, move, battle, build). Prioritise legal completions that avoid Turmoil.`
    }
    if (faction === 'woodland_alliance') {
      return `You rely on sympathy expansion, guerrilla warfare, and careful officer management. Prioritise spreading sympathy, defending bases, or striking vulnerable enemies.`
    }
    return `Focus on keeping tempo and making legal moves for your faction.`
  })()

  const adjacencySummary = WOODLAND_BOARD_DEFINITION.clearings
    .map(
      clearing =>
        `- ${clearing.id.toUpperCase()} → ${clearing.adjacentClearings
          .map(adj => adj.toUpperCase())
          .join(', ') || 'no adjacency'}`,
    )
    .join('\n')

  const actionMenu = `You must choose exactly ONE of the following actions and output valid JSON that matches the schema. Use lowercase clearing ids that exist on the provided board. Legal requirement highlights:
- Move: source must contain your warriors and destination must be ADJACENT (see adjacency list below). You must leave at least one warrior behind unless rules allow otherwise.
- Battle: clearing must contain your warriors and enemy pieces.
- Build: clearing must be valid for your faction (Eyrie = roost anywhere with warriors, Alliance bases must match suit, etc.). CRITICAL: You can only build in clearings with AVAILABLE building slots (check the "slots available" count in the board summary above). If a clearing shows "0 available" slots, you CANNOT build there.
- Token: only Woodland Alliance can place sympathy where legally allowed.
- Pass: only if no legal action exists.

Adjacency reference:
${adjacencySummary}

- move: { "type": "move", "from": "c1", "to": "c2", "warriors": 2 }
- battle: { "type": "battle", "clearingId": "c9", "defender": "marquise" }
- build: { "type": "build", "clearingId": "c5", "buildingType": "roost" } // woodland_alliance must use base_mouse/base_rabbit/base_fox
- token: { "type": "token", "clearingId": "c7", "tokenType": "sympathy" } // only Woodland Alliance should pick this
- pass: { "type": "pass", "reason": "short explanation" } // when no legal move is possible`

  const recentActionText =
    recentActions && recentActions.length > 0
      ? `Recent simulated actions for this faction:\n${recentActions
          .map((entry, idx) => `${idx + 1}. ${entry.action}`)
          .join('\n')}\n\nAvoid repeating the exact same action or target unless it remains the ONLY legal choice.`
      : 'No previous simulated actions recorded for this faction.'

  return `${baseContext}

${factionSpecific}

${recentActionText}

${actionMenu}

Return ONLY JSON like:
{"action":{"type":"move",...},"reasoning":"short sentence"}
`
}

export const POST = apiController<SimulateActionRequest, SimulateActionResponse>(async ({ state, faction, recentActions }) => {
  const raw = await gptChatCompletion({
    messages: [
      { role: 'system', content: buildFactionPrompt(faction, state, recentActions) },
      {
        role: 'user',
        content: `Analyze the state and produce one legal action JSON exactly matching the schema described above. Do not wrap it in markdown. Double-check that:
1. You have enough warriors in the "from" clearing before moving or battling (and do not move more than available).
2. Destinations for moves are adjacent (use the provided adjacency list).
3. Battles occur only where both you and the defender have pieces.
4. Builds and tokens obey faction-specific placement rules.
If you cannot produce a legal action, return the pass action.`,
      },
    ],
    temperature: 0.4,
    max_tokens: 800,
  })

  let parsed: unknown
  try {
    parsed = JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw))
  } catch {
    throw new Error(`Simulation model returned invalid JSON: ${raw}`)
  }

  const validated = SimulationResponseSchema.safeParse(parsed)
  if (!validated.success) {
    throw new Error(`Simulation output failed validation: ${validated.error.message}`)
  }

  return validated.data
})

