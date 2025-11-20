import { PlayerProfile } from '@/constants/scenarios'
import { Skill } from '@/constants/skills'
import { BUILDING_TYPES, DECREE_COLUMNS, FACTIONS, GameState, PHASES, SUITS, TOKEN_TYPES } from '@/gameState/schema'
import { apiController } from '@/utils/api-controller'
import { gptChatCompletion } from '@/utils/openai'
import { zodResponseFormat } from 'openai/helpers/zod.js'
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

const decreeCardSchema = z
  .object({
    suit: z.enum(SUITS),
    source: z.enum(['vizier', 'normal']),
    id: z.string(),
  })
  .strict()

const decreeSchema = z
  .object({
    columns: z
      .object({
        recruit: z.array(decreeCardSchema).default([]),
        move: z.array(decreeCardSchema).default([]),
        battle: z.array(decreeCardSchema).default([]),
        build: z.array(decreeCardSchema).default([]),
      })
      .strict(),
    lastResolutionResult: z.array(
      z
        .object({
          column: z.enum(DECREE_COLUMNS),
          cardId: z.string(),
          success: z.boolean(),
          reasonIfFail: z.string(),
        })
        .strict()
    ),
  })
  .strict()

const clearingSchema = z
  .object({
    id: z.string(),
    warriors: z
      .object({
        marquise: z.number(),
        eyrie: z.number(),
        woodland_alliance: z.number(),
      })
      .strict(),
    buildings: z
      .array(
        z
          .object({
            id: z.string(),
            faction: z.enum(FACTIONS),
            type: z.enum(BUILDING_TYPES),
            slotIndex: z.number(),
          })
          .strict()
      )
      .default([]),
    tokens: z
      .array(
        z
          .object({
            id: z.string(),
            faction: z.enum(FACTIONS),
            type: z.enum(TOKEN_TYPES),
          })
          .strict()
      )
      .default([]),
  })
  .strict()

const gameStateSchema = z
  .object({
    board: z
      .object({
        clearings: z.array(clearingSchema).default([]),
      })
      .strict(),
    factions: z
      .object({
        marquise: z
          .object({
            faction: z.enum(['marquise']),
            warriorsInSupply: z.number(),
            woodInSupply: z.number(),
            buildingTracks: z
              .object({
                sawmill: z.object({ definitionId: z.string(), builtCount: z.number() }).strict(),
                workshop: z.object({ definitionId: z.string(), builtCount: z.number() }).strict(),
                recruiter: z.object({ definitionId: z.string(), builtCount: z.number() }).strict(),
              })
              .strict(),
            totalSawmillsOnMap: z.number(),
            totalWorkshopsOnMap: z.number(),
            totalRecruitersOnMap: z.number(),
          })
          .strict(),
        eyrie: z
          .object({
            faction: z.enum(['eyrie']),
            warriorsInSupply: z.number(),
            decree: decreeSchema,
            roostTrack: z.object({ definitionId: z.string(), roostsPlaced: z.number() }).strict(),
            roostsOnMap: z.number(),
          })
          .strict(),
        woodland_alliance: z
          .object({
            faction: z.enum(['woodland_alliance']),
            warriorsInSupply: z.number(),
            bases: z.object({ mouse: z.boolean(), rabbit: z.boolean(), fox: z.boolean() }).strict(),
            officers: z.number(),
            sympathyTrack: z.object({ definitionId: z.string(), sympathyPlaced: z.number() }).strict(),
            sympathyOnMap: z.number(),
          })
          .strict(),
      })
      .strict(),
    victoryTrack: z.object({ marquise: z.number(), eyrie: z.number(), woodland_alliance: z.number() }).strict(),
    turn: z.object({ currentFaction: z.enum(FACTIONS), phase: z.enum(PHASES), roundNumber: z.number() }).strict(),
  })
  .strict()

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
  const { gameState, eyrieProfile, allianceProfile } = await gptChatCompletion<{
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
    response_format: zodResponseFormat(
      z
        .object({ gameState: gameStateSchema, eyrieProfile: playerProfileSchema, allianceProfile: playerProfileSchema })
        .strict(),
      'gameState'
    ),
  })

  return { gameState: normalizeGameState(gameState), eyrieProfile, allianceProfile }
})

const CREATE_GAME_STATE_PROMPT = (skill: Skill, description: string) =>
  `
You are an expert game designer specializing in creating the board game named "Root," which involves asymmetric gameplay, area control, and strategic resource management.
Your task is to generate a comprehensive game state in JSON format that aligns with the a learner's goal of improving a specific skill through gameplay.
The learner is playing as the Marquise de Cat faction.
The skill to improve is: ${skill}.
The scenario to practice is described as: ${description}.
Also, generate the profile of two AI opponents playing as the Eyrie Dynasties and the Woodland Alliance factions, ensuring their strategies complement the learner's goal.
`.trim()
