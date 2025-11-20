import { apiController } from '@/utils/api-controller'
import { gptChatCompletion } from '@/utils/openai'
import { AI_ACTION_DECISION_PROMPT, AIActionDecision } from '@/prompts/aiAction'
import { GameState, FactionId } from '@/gameState/schema'
import { PlayerProfile } from '@/constants/scenarios'
import OpenAI from 'openai'

export type AIActionRequest = {
  faction: FactionId
  gameState: GameState
  profile: PlayerProfile
}

export type AIActionResponse = {
  action: AIActionDecision
  reasoning: string
}

const actionSchema: OpenAI.ResponseFormatJSONSchema = {
  name: 'ai_action_decision',
  schema: {
    type: 'object',
    properties: {
      action: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['move', 'battle', 'build', 'recruit', 'pass']
          },
          from: { type: 'string' },
          to: { type: 'string' },
          warriors: { type: 'number' },
          clearingId: { type: 'string' },
          defender: { 
            type: 'string',
            enum: ['marquise', 'eyrie', 'woodland_alliance']
          },
          buildingType: { type: 'string' }
        },
        required: ['type']
      },
      reasoning: { type: 'string' }
    },
    required: ['action', 'reasoning'],
    additionalProperties: false
  },
  strict: false
}

export const POST = apiController<AIActionRequest, AIActionResponse>(async ({ faction, gameState, profile }) => {
  const prompt = AI_ACTION_DECISION_PROMPT(faction, gameState, profile)
  
  const response = await gptChatCompletion<AIActionResponse>({
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: 'What action should I take in this turn?' }
    ],
    model: 'gpt-4o-mini',
    temperature: 0.7,
    max_tokens: 500,
    response_format: {
      type: 'json_schema',
      json_schema: actionSchema
    }
  })

  return response
})

