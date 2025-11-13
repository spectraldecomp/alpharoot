import { apiController } from '@/app/utils/api-controller'
import { gptChatCompletion } from '@/app/utils/openai'

export type ChatCompletionParams = {
  conversation: {
    role: 'assistant' | 'user' | 'system'
    content: string
  }[]
}

export type ChatCompletionResults = {
  content: string
}

export const POST = apiController<ChatCompletionParams, ChatCompletionResults>(async ({ conversation }) => {
  const content = await gptChatCompletion({
    messages: conversation,
  })

  return { content }
})
