import { ChatCompletionParams, ChatCompletionResults } from '@/app/api/chatComplete/route'
import { queryFactory } from '@/app/utils/queryFactory'
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

export const commonApi = createApi({
  reducerPath: 'commonApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  endpoints: builder => ({
    chatComplete: builder.mutation<ChatCompletionResults, ChatCompletionParams>({
      query: queryFactory('chatComplete'),
    }),
  }),
})

export const { useChatCompleteMutation } = commonApi
