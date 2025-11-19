import { MultiPartyChat } from '@/app/learn/page'
import { SCENARIOS } from '@/constants/scenarios'
import { ALLIANCE_SYSTEM_PROMPT } from '@/prompts/alliance'
import { EYRIE_SYSTEM_PROMPT } from '@/prompts/eyrie'
import { useChatCompleteMutation } from '@/redux/api/common'
import { useCallback, useState } from 'react'

export function useMultiPartyChat(scenario: (typeof SCENARIOS)[number]) {
  const [playerChatComplete, { isLoading: loadingPlayerResponse }] = useChatCompleteMutation()
  const [playerConversation, setPlayerConversation] = useState<MultiPartyChat>([
    { role: 'assistant', content: 'Hi there, I am the Alliance faction.', faction: 'alliance' },
    { role: 'assistant', content: 'Greetings, I represent the Eyrie faction.', faction: 'eyrie' },
  ])
  const [playerMessage, setPlayerMessage] = useState('')

  const playerChat = useCallback(async () => {
    if (!loadingPlayerResponse) {
      const newConversation = [
        ...playerConversation,
        { role: 'user' as const, content: playerMessage, faction: 'cat' as const },
      ]
      setPlayerConversation(newConversation)
      setPlayerMessage('')
      const [allianceResponse, eyrieResponse] = await Promise.all([
        playerChatComplete({
          conversation: [
            { role: 'system', content: ALLIANCE_SYSTEM_PROMPT(scenario.allianceProfile, newConversation) },
            { role: 'user' as const, content: playerMessage },
          ],
        }).unwrap(),
        playerChatComplete({
          conversation: [
            { role: 'system', content: EYRIE_SYSTEM_PROMPT(scenario.eyrieProfile, newConversation) },
            { role: 'user' as const, content: playerMessage },
          ],
        }).unwrap(),
      ])
      if (Math.random() < 0.5) {
        setPlayerConversation(prev => [
          ...prev,
          { role: 'assistant' as const, faction: 'eyrie', content: eyrieResponse.content },
          { role: 'assistant' as const, faction: 'alliance', content: allianceResponse.content },
        ])
      } else {
        setPlayerConversation(prev => [
          ...prev,
          { role: 'assistant' as const, faction: 'alliance', content: allianceResponse.content },
          { role: 'assistant' as const, faction: 'eyrie', content: eyrieResponse.content },
        ])
      }
    }
  }, [
    loadingPlayerResponse,
    playerChatComplete,
    playerConversation,
    playerMessage,
    scenario.allianceProfile,
    scenario.eyrieProfile,
  ])

  return { playerChat, setPlayerMessage, playerConversation, playerMessage, loadingPlayerResponse }
}
