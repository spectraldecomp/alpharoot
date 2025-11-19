import { MultiPartyChat } from '@/app/learn/page'
import { SCENARIOS } from '@/constants/scenarios'
import { ALLIANCE_SYSTEM_PROMPT } from '@/prompts/alliance'
import { EYRIE_SYSTEM_PROMPT } from '@/prompts/eyrie'
import { useChatCompleteMutation } from '@/redux/api/common'
import { last } from 'lodash'
import { useCallback, useState } from 'react'

export function useMultiPartyChat(scenario: (typeof SCENARIOS)[number]) {
  const [playerChatComplete, { isLoading: loadingPlayerResponse }] = useChatCompleteMutation()
  const [playerConversation, setPlayerConversation] = useState<MultiPartyChat>([
    { role: 'assistant', content: 'Hi there, I am the Alliance faction.', faction: 'alliance' },
    { role: 'assistant', content: 'Greetings, I represent the Eyrie faction.', faction: 'eyrie' },
  ])
  const [playerMessage, setPlayerMessage] = useState('')

  const eyrieChat = useCallback(
    async (conversation: MultiPartyChat) => {
      const { content } = await playerChatComplete({
        conversation: [
          { role: 'system', content: EYRIE_SYSTEM_PROMPT(scenario.eyrieProfile, conversation) },
          { role: 'user' as const, content: last(conversation)?.content ?? '' },
        ],
      }).unwrap()
      const newConversation = [
        ...conversation,
        { role: 'assistant' as const, faction: 'eyrie' as const, content: content },
      ]
      setPlayerConversation(newConversation)
      return newConversation
    },
    [playerChatComplete, scenario.eyrieProfile]
  )

  const allianceChat = useCallback(
    async (conversation: MultiPartyChat) => {
      const { content } = await playerChatComplete({
        conversation: [
          { role: 'system', content: ALLIANCE_SYSTEM_PROMPT(scenario.allianceProfile, conversation) },
          { role: 'user' as const, content: last(conversation)?.content ?? '' },
        ],
      }).unwrap()
      const newConversation = [
        ...conversation,
        { role: 'assistant' as const, faction: 'alliance' as const, content: content },
      ]
      setPlayerConversation(newConversation)
      return newConversation
    },
    [playerChatComplete, scenario.allianceProfile]
  )

  const playerChat = useCallback(async () => {
    if (!loadingPlayerResponse) {
      const newConversation = [
        ...playerConversation,
        { role: 'user' as const, content: playerMessage, faction: 'cat' as const },
      ]
      setPlayerConversation(newConversation)
      setPlayerMessage('')
      if (Math.random() < 0.5) {
        const nextConversation = await eyrieChat(newConversation)
        await allianceChat(nextConversation)
      } else {
        const nextConversation = await allianceChat(newConversation)
        await eyrieChat(nextConversation)
      }
    }
  }, [allianceChat, eyrieChat, loadingPlayerResponse, playerConversation, playerMessage])

  return { playerChat, setPlayerMessage, playerConversation, playerMessage, loadingPlayerResponse }
}
