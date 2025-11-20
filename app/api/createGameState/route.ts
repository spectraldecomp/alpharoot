import { PlayerProfile } from '@/constants/scenarios'
import { Skill } from '@/constants/skills'
import { GameState } from '@/gameState/schema'
import { apiController } from '@/utils/api-controller'
import { gptChatCompletion } from '@/utils/openai'
import { z } from 'zod'

export type CreateGameStateParams = {
  skill: Skill
  description: string
}

export type CreateGameStateResults = {
  gameState: GameState
  eyrieProfile: PlayerProfile
  allianceProfile: PlayerProfile
}

const decreeCardSchema = z.object({
  suit: z.enum(['fox', 'rabbit', 'mouse', 'bird', 'none']),
  source: z.enum(['vizier', 'normal']),
  id: z.string(),
})

const decreeSchema = z.object({
  columns: z.object({
    recruit: z.array(decreeCardSchema).default([]),
    move: z.array(decreeCardSchema).default([]),
    battle: z.array(decreeCardSchema).default([]),
    build: z.array(decreeCardSchema).default([]),
  }),
  lastResolutionResult: z.array(
    z.object({
      column: z.enum(['recruit', 'move', 'battle', 'build']),
      cardId: z.string(),
      success: z.boolean(),
      reasonIfFail: z.string(),
    })
  ).default([]),
})

const clearingSchema = z.object({
  id: z.string(),
  warriors: z.object({
    marquise: z.number(),
    eyrie: z.number(),
    woodland_alliance: z.number(),
  }),
  buildings: z.array(
    z.object({
      id: z.string(),
      faction: z.enum(['marquise', 'eyrie', 'woodland_alliance']),
      type: z.enum(['sawmill', 'workshop', 'recruiter', 'roost', 'base_mouse', 'base_rabbit', 'base_fox', 'keep']),
      slotIndex: z.number(),
    })
  ).default([]),
  tokens: z.array(
    z.object({
      id: z.string(),
      faction: z.enum(['marquise', 'eyrie', 'woodland_alliance']),
      type: z.enum(['wood', 'sympathy', 'other']),
    })
  ).default([]),
})

const gameStateSchema = z.object({
  board: z.object({
    clearings: z.array(clearingSchema).default([]),
  }),
  factions: z.object({
    marquise: z.object({
      faction: z.enum(['marquise']),
      warriorsInSupply: z.number(),
      woodInSupply: z.number(),
      buildingTracks: z.object({
        sawmill: z.object({ definitionId: z.string(), builtCount: z.number() }),
        workshop: z.object({ definitionId: z.string(), builtCount: z.number() }),
        recruiter: z.object({ definitionId: z.string(), builtCount: z.number() }),
      }),
      totalSawmillsOnMap: z.number(),
      totalWorkshopsOnMap: z.number(),
      totalRecruitersOnMap: z.number(),
    }),
    eyrie: z.object({
      faction: z.enum(['eyrie']),
      warriorsInSupply: z.number(),
      decree: decreeSchema,
      roostTrack: z.object({ definitionId: z.string(), roostsPlaced: z.number() }),
      roostsOnMap: z.number(),
    }),
    woodland_alliance: z.object({
      faction: z.enum(['woodland_alliance']),
      warriorsInSupply: z.number(),
      bases: z.object({ mouse: z.boolean(), rabbit: z.boolean(), fox: z.boolean() }),
      officers: z.number(),
      sympathyTrack: z.object({ definitionId: z.string(), sympathyPlaced: z.number() }),
      sympathyOnMap: z.number(),
    }),
  }),
  victoryTrack: z.object({ marquise: z.number(), eyrie: z.number(), woodland_alliance: z.number() }),
  turn: z.object({ currentFaction: z.enum(['marquise', 'eyrie', 'woodland_alliance']), phase: z.enum(['birdsong', 'daylight', 'evening']), roundNumber: z.number() }),
})

// Debug: Check the gameStateSchema
console.log('[createGameState] gameStateSchema._def:', gameStateSchema._def)
console.log('[createGameState] gameStateSchema shape keys:', Object.keys(gameStateSchema.shape))

const normalizeGameState = (raw: z.infer<typeof gameStateSchema>): GameState => {
  const clearings = raw.board.clearings.reduce<GameState['board']['clearings']>((acc, clearing) => {
    acc[clearing.id] = {
      ...clearing,
      warriors: clearing.warriors ?? {},
    }
    return acc
  }, {})

  return {
    board: { clearings },
    factions: raw.factions,
    victoryTrack: raw.victoryTrack,
    turn: raw.turn,
  }
}

const playerProfileSchema = z.object({
  proficiencyLevel: z.enum(['Beginner', 'Intermediate', 'Advanced']),
  playStyle: z.enum(['Aggressive', 'Defensive', 'Balanced', 'Cooperative']),
})

export const POST = apiController<CreateGameStateParams, CreateGameStateResults>(async ({ skill, description }) => {
  // Create the response schema
  const responseSchema = z.object({ 
    gameState: gameStateSchema, 
    eyrieProfile: playerProfileSchema, 
    allianceProfile: playerProfileSchema 
  })

  // Use regular JSON mode instead of structured outputs due to zod-to-json-schema limitations
  let response
  try {
    response = await gptChatCompletion<{
      gameState: z.infer<typeof gameStateSchema>
      eyrieProfile: z.infer<typeof playerProfileSchema>
      allianceProfile: z.infer<typeof playerProfileSchema>
    }>({
      messages: [
        {
          role: 'user',
          content: CREATE_GAME_STATE_PROMPT(skill, description),
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 4000, // Increased from default 1000 to accommodate full game state
    })
  } catch (error) {
    console.error('[createGameState] GPT response error:', error)
    console.error('[createGameState] Error details:', error instanceof Error ? error.message : String(error))
    throw error
  }

  // Validate the response against our schema
  let validated
  try {
    validated = responseSchema.parse(response)
  } catch (error) {
    console.error('[createGameState] Validation error:', error)
    console.error('[createGameState] Raw response:', JSON.stringify(response, null, 2))
    throw error
  }

  return { 
    gameState: normalizeGameState(validated.gameState), 
    eyrieProfile: validated.eyrieProfile, 
    allianceProfile: validated.allianceProfile 
  }
})

const CREATE_GAME_STATE_PROMPT = (skill: Skill, description: string) =>
  `
You are an expert game designer specializing in creating the board game named "Root," which involves asymmetric gameplay, area control, and strategic resource management.

**Task:** Generate a comprehensive game state that aligns with a learner's goal of improving a specific skill through gameplay.

**Learner Information:**
- Playing as: Marquise de Cat faction
- Skill to improve: ${skill}
- Scenario description: ${description}

**Existing Scenario Example (for reference):**
Here's how a mid-game scenario is structured:

MARQUISE (Player):
- Buildings: Keep at c1, Recruiter at c1, Sawmill at c4, Workshop at c4, Sawmill at c7
- Tokens: Wood at c4, Wood at c7
- Warriors: 4 at c1, 3 at c4, 2 at c7, 2 at c5
- Victory Points: 11

EYRIE (AI):
- Buildings: Roost at c2, Roost at c5, Roost at c9
- Warriors: 4 at c2, 3 at c5, 3 at c9
- Decree Cards:
  - Recruit column: 1 vizier card (rabbit)
  - Move column: 1 vizier card (bird)
  - Battle column: 1 normal card (fox)
  - Build column: 1 normal card (mouse)
- Victory Points: 14

WOODLAND ALLIANCE (AI):
- Buildings: Base (rabbit) at c11
- Tokens: Sympathy at c7, Sympathy at c11
- Warriors: 2 at c11
- Officers: 1
- Victory Points: 6

Game State: Round 3, Eyrie's turn, Daylight phase

**Your Response Format:**

Return a JSON object matching this exact structure:

{
  "gameState": {
    "board": {
      "clearings": [
        {
          "id": "c1",
          "warriors": { "marquise": 4, "eyrie": 0, "woodland_alliance": 0 },
          "buildings": [
            { "id": "marquise_keep_c1_0", "faction": "marquise", "type": "keep", "slotIndex": 0 },
            { "id": "marquise_recruiter_c1_1", "faction": "marquise", "type": "recruiter", "slotIndex": 1 }
          ],
          "tokens": []
        },
        {
          "id": "c2",
          "warriors": { "marquise": 0, "eyrie": 4, "woodland_alliance": 0 },
          "buildings": [
            { "id": "eyrie_roost_c2_0", "faction": "eyrie", "type": "roost", "slotIndex": 0 }
          ],
          "tokens": []
        },
        {
          "id": "c3",
          "warriors": { "marquise": 0, "eyrie": 0, "woodland_alliance": 0 },
          "buildings": [],
          "tokens": []
        }
        // ... include ALL 12 clearings (c1 through c12)
      ]
    },
    "factions": {
      "marquise": {
        "faction": "marquise",
        "warriorsInSupply": 14,  // 25 total - warriors on board
        "woodInSupply": 6,       // 8 total - wood tokens on board
        "buildingTracks": {
          "sawmill": { "definitionId": "marquise_sawmill", "builtCount": 2 },
          "workshop": { "definitionId": "marquise_workshop", "builtCount": 1 },
          "recruiter": { "definitionId": "marquise_recruiter", "builtCount": 1 }
        },
        "totalSawmillsOnMap": 2,
        "totalWorkshopsOnMap": 1,
        "totalRecruitersOnMap": 1
      },
      "eyrie": {
        "faction": "eyrie",
        "warriorsInSupply": 10,  // 20 total - warriors on board
        "decree": {
          "columns": {
            "recruit": [
              { "id": "vizier_recruit", "suit": "rabbit", "source": "vizier" }
            ],
            "move": [
              { "id": "vizier_move", "suit": "bird", "source": "vizier" }
            ],
            "battle": [
              { "id": "battle_fox_0", "suit": "fox", "source": "normal" }
            ],
            "build": [
              { "id": "build_mouse_0", "suit": "mouse", "source": "normal" }
            ]
          }
        },
        "roostTrack": { "definitionId": "default_roost_track", "roostsPlaced": 3 },
        "roostsOnMap": 3
      },
      "woodland_alliance": {
        "faction": "woodland_alliance",
        "warriorsInSupply": 8,  // 10 total - warriors on board
        "bases": { "mouse": false, "rabbit": true, "fox": false },
        "officers": 1,
        "sympathyTrack": { "definitionId": "default_sympathy_track", "sympathyPlaced": 2 },
        "sympathyOnMap": 2
      }
    },
    "victoryTrack": {
      "marquise": 11,
      "eyrie": 14,
      "woodland_alliance": 6
    },
    "turn": {
      "currentFaction": "eyrie",
      "phase": "daylight",
      "roundNumber": 3
    }
  },
  "eyrieProfile": {
    "proficiencyLevel": "Intermediate",
    "playStyle": "Aggressive"
  },
  "allianceProfile": {
    "proficiencyLevel": "Beginner",
    "playStyle": "Defensive"
  }
}

**Critical Requirements:**

1. **All 12 clearings** (c1-c12) MUST be included in the clearings array
2. **Building IDs** follow pattern: "{faction}_{type}_{clearingId}_{slotIndex}"
3. **Token IDs** follow pattern: "{faction}_{type}_{clearingId}_{index}"
4. **Decree card IDs** follow pattern: "{column}_{suit}_{index}" OR "vizier_{column}" for vizier cards
5. **Warriors in supply** = Total warriors (Marquise: 25, Eyrie: 20, Alliance: 10) - warriors on board
6. **Wood in supply** = 8 - wood tokens on board
7. **Building tracks** must match the buildings on the map
8. **Suits** are: "fox", "rabbit", "mouse", "bird"
9. **Building types:**
   - Marquise: "keep", "sawmill", "workshop", "recruiter"
   - Eyrie: "roost"
   - Woodland Alliance: "base_mouse", "base_rabbit", "base_fox"
10. **Token types:** "wood" (Marquise), "sympathy" (Woodland Alliance)
11. **Proficiency levels:** "Beginner", "Intermediate", "Advanced"
12. **Play styles:** "Aggressive", "Defensive", "Balanced", "Cooperative"

**Design the scenario to:**
- Create meaningful tactical challenges related to the skill: ${skill}
- Set appropriate victory point totals (typically 0-20 range)
- Position pieces to create interesting strategic decisions
- Balance the game state so no faction is overwhelmingly dominant
- Make AI profiles complement the learning objective

**IMPORTANT: JSON Formatting**
- Return ONLY valid JSON - no markdown, no code blocks, no additional text
- Ensure all strings are properly escaped (use \\" for quotes inside strings)
- Do not include newlines or special characters inside string values
- The reasonIfFail field should be a simple string without line breaks

Return the JSON object now:
`.trim()
