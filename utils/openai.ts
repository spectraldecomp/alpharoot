import { Env } from '@/utils/env'
import OpenAI from 'openai'
import { Chat } from 'openai/resources'

const openai = new OpenAI({
  apiKey: Env.OPEN_AI_KEY,
})

interface Params {
  messages: Chat.ChatCompletionMessageParam[]
  stop?: string
  max_tokens?: number
  temperature?: number
  model?: string
  response_format?: OpenAI.ResponseFormatJSONSchema | OpenAI.ResponseFormatJSONObject | OpenAI.ResponseFormatText
}

export async function gptChatCompletion<Format = string>({
  messages,
  stop,
  max_tokens = 1000,
  temperature = 1,
  model = 'gpt-4o-mini',
  response_format,
}: Params) {
  const response = await openai.chat.completions.create({
    model,
    max_tokens,
    messages,
    stop,
    temperature,
    response_format,
  })
  const res = response.choices[0].message?.content ?? ''

  if (response_format) {
    try {
      return JSON.parse(res) as Format
    } catch (error) {
      console.error('[openai] JSON parse error:', error)
      console.error('[openai] Raw response text (first 5000 chars):', res.substring(0, 5000))
      console.error('[openai] Raw response text (around error position):', res.substring(3050, 3200))
      throw error
    }
  } else {
    return res as Format
  }
}
