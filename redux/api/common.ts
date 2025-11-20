import { ChatCompletionParams, ChatCompletionResults } from '@/app/api/chatComplete/route'
import { CreateGameStateParams, CreateGameStateResults } from '@/app/api/createGameState/route'
import { queryFactory } from '@/utils/queryFactory'
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

export const commonApi = createApi({
  reducerPath: 'commonApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  endpoints: builder => ({
    chatComplete: builder.mutation<ChatCompletionResults, ChatCompletionParams>({
      query: queryFactory('chatComplete'),
    }),
    createGameState: builder.mutation<CreateGameStateResults, CreateGameStateParams>({
      query: queryFactory('createGameState'),
    }),
  }),
})

export const { useChatCompleteMutation, useCreateGameStateMutation } = commonApi
