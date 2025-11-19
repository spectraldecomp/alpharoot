'use client'
import { ChatInput } from '@/components/chatInput'
import { ChatViewer } from '@/components/chatViewer'
import { GameBoard } from '@/components/gameBoard'
import { SCENARIOS } from '@/constants/scenarios'
import { WOODLAND_BOARD_DEFINITION } from '@/gameState/boardDefinition'
import { summarizeGameState } from '@/gameState/actions'
import { getNextFaction, getNextPhase, getScenarioGameState } from '@/gameState/scenarioState'
import { DecreeColumn, FactionId, GameState } from '@/gameState/schema'
import { useMultiPartyChat } from '@/hooks/useMultiPartyChat_realtime'
import { TUTOR_SYSTEM_PROMPT } from '@/prompts/tutor'
import { useChatCompleteMutation } from '@/redux/api/common'
import { ThemeProvider, css } from '@emotion/react'
import styled from '@emotion/styled'
import { DEFAULT_LIGHT_THEME } from '@wookiejin/react-component'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChatCompletionParams } from '../api/chatComplete/route'

export type MultiPartyChat = (ChatCompletionParams['conversation'][number] & {
  faction?: 'cat' | 'alliance' | 'eyrie'
})[]

const DIFFICULTY_LABELS = ['Easy', 'Medium', 'Hard'] as const

const FACTION_META: Record<FactionId, { label: string; color: string }> = {
  marquise: { label: 'Marquise de Cat', color: '#d96a3d' },
  eyrie: { label: 'Eyrie Dynasties', color: '#2f5faf' },
  woodland_alliance: { label: 'Woodland Alliance', color: '#2f8c5b' },
}

const VICTORY_TARGET = 30
const formatPhaseLabel = (phase: GameState['turn']['phase']) =>
  phase.charAt(0).toUpperCase() + phase.slice(1)

export default function Home() {
  const searchParams = useSearchParams()
  const scenarioIndexParam = Number(searchParams.get('scenario') ?? 0)
  const scenarioIndex = Number.isNaN(scenarioIndexParam)
    ? 0
    : Math.min(Math.max(scenarioIndexParam, 0), SCENARIOS.length - 1)
  const scenario = SCENARIOS[scenarioIndex]
  const [tutorChatComplete, { isLoading: loadingTutorResponse }] = useChatCompleteMutation()
  const {
    playerConversation,
    playerMessage,
    loadingAllianceResponse,
    loadingEyrieResponse,
    setPlayerMessage,
    playerChat,
  } = useMultiPartyChat(scenario)
  const [tutorMessage, setTutorMessage] = useState('')
  const [gameState, setGameState] = useState<GameState>(() => getScenarioGameState(scenarioIndex))
  const [lastPlayerAction, setLastPlayerAction] = useState<string>(() => `Loaded ${scenario.title}.`)
  const tutorChatRef = useRef<HTMLDivElement>(null)
  const playerChatRef = useRef<HTMLDivElement>(null)
  const [tutorConversation, setTutorConversation] = useState<ChatCompletionParams['conversation']>([
    { role: 'assistant', content: 'Hi apprentice, I’m the Wise Cat.' },
  ])
  const boardSummary = useMemo(() => summarizeGameState(gameState), [gameState])
  const tutorSystemPrompt = useMemo(
    () =>
      TUTOR_SYSTEM_PROMPT({
        profile: scenario.playerProfile,
        boardState: boardSummary,
        playerAction: lastPlayerAction,
        socialConversation: playerConversation,
      }),
    [scenario.playerProfile, boardSummary, lastPlayerAction, playerConversation],
  )

  const tutorChat = useCallback(async () => {
    if (loadingTutorResponse) return
    const trimmedMessage = tutorMessage.trim()
    if (!trimmedMessage) return
    const newConversation = [...tutorConversation, { role: 'user' as const, content: trimmedMessage }]
    setTutorConversation(newConversation)
    setTutorMessage('')
    const response = await tutorChatComplete({
      conversation: [{ role: 'system', content: tutorSystemPrompt }, ...newConversation],
    }).unwrap()
    setTutorConversation(prev => [...prev, { role: 'assistant' as const, content: response.content }])
  }, [loadingTutorResponse, tutorChatComplete, tutorConversation, tutorMessage, tutorSystemPrompt])

  useEffect(() => {
    setGameState(getScenarioGameState(scenarioIndex))
    setLastPlayerAction(`Loaded ${scenario.title}.`)
  }, [scenarioIndex, scenario.title])

  useEffect(() => {
    if (tutorConversation) {
      tutorChatRef.current?.scrollTo(0, tutorChatRef.current.scrollHeight)
    }
  }, [tutorConversation])

  useEffect(() => {
    if (playerConversation) {
      playerChatRef.current?.scrollTo(0, playerChatRef.current.scrollHeight)
    }
  }, [playerConversation])

  const cloneGameState = useCallback((value: GameState) => JSON.parse(JSON.stringify(value)) as GameState, [])

  const advancePhase = useCallback(() => {
    let description = ''
    setGameState(prev => {
      const next = cloneGameState(prev)
      const actingFaction = next.turn.currentFaction
      const previousPhase = next.turn.phase
      const newPhase = getNextPhase(previousPhase)
      description = `Advanced ${FACTION_META[actingFaction].label} from ${formatPhaseLabel(
        previousPhase,
      )} to ${formatPhaseLabel(newPhase)}`

      if (previousPhase === 'evening') {
        const nextFaction = getNextFaction(next.turn.currentFaction)
        next.turn.currentFaction = nextFaction
        if (nextFaction === 'marquise') {
          next.turn.roundNumber += 1
        }
      }

      next.turn.phase = newPhase
      next.turn.actionSubstep = undefined
      return next
    })
    setLastPlayerAction(description || 'Advanced phase')
  }, [cloneGameState])

  const advanceFaction = useCallback(() => {
    let description = ''
    setGameState(prev => {
      const next = cloneGameState(prev)
      const fromFaction = next.turn.currentFaction
      const nextFaction = getNextFaction(fromFaction)
      if (nextFaction === 'marquise') {
        next.turn.roundNumber += 1
      }
      next.turn.currentFaction = nextFaction
      next.turn.phase = 'birdsong'
      next.turn.actionSubstep = undefined
      description = `Passed turn from ${FACTION_META[fromFaction].label} to ${FACTION_META[nextFaction].label}`
      return next
    })
    setLastPlayerAction(description || 'Passed turn')
  }, [cloneGameState])

  const resetGameState = useCallback(() => {
    setGameState(getScenarioGameState(scenarioIndex))
    setLastPlayerAction(`Reset to ${scenario.title}.`)
  }, [scenarioIndex, scenario.title])

  const logistics = useMemo(() => {
    const allianceBases = Object.entries(gameState.factions.woodland_alliance.bases)
      .filter(([, planted]) => planted)
      .map(([suit]) => suit.replace(/^\w/, c => c.toUpperCase()))
      .join(', ')
      .replace(/_/g, ' ')
    return [
      {
        id: 'marquise' as FactionId,
        primary: `${gameState.factions.marquise.warriorsInSupply} warriors in supply`,
        secondary: `Wood: ${gameState.factions.marquise.woodInSupply}`,
        tags: [
          `Sawmills · ${gameState.factions.marquise.totalSawmillsOnMap}`,
          `Workshops · ${gameState.factions.marquise.totalWorkshopsOnMap}`,
          `Recruiters · ${gameState.factions.marquise.totalRecruitersOnMap}`,
        ],
        victory: gameState.victoryTrack.marquise,
      },
      {
        id: 'eyrie' as FactionId,
        primary: `${gameState.factions.eyrie.warriorsInSupply} warriors in supply`,
        secondary: `Roosts on map: ${gameState.factions.eyrie.roostsOnMap}`,
        tags: (['recruit', 'move', 'battle', 'build'] as DecreeColumn[]).map(column => {
          const label = column.replace(/^\w/, c => c.toUpperCase())
          return `${label} · ${gameState.factions.eyrie.decree.columns[column].length}`
        }),
        victory: gameState.victoryTrack.eyrie,
      },
      {
        id: 'woodland_alliance' as FactionId,
        primary: `${gameState.factions.woodland_alliance.warriorsInSupply} warriors in supply`,
        secondary: `Officers: ${gameState.factions.woodland_alliance.officers}`,
        tags: [
          `Sympathy · ${gameState.factions.woodland_alliance.sympathyOnMap}`,
          `Bases · ${allianceBases || 'None'}`,
        ],
        victory: gameState.victoryTrack.woodland_alliance,
      },
    ]
  }, [gameState])

  return (
    <ThemeProvider theme={DEFAULT_LIGHT_THEME}>
      <main>
        <Container>
          <TutorChatSection>
            <ChatContainer ref={tutorChatRef}>
              <ChatViewer
                conversation={tutorConversation}
                isReplying={loadingTutorResponse}
                typingAvatar="tutor"
              />
            </ChatContainer>
            <ChatInput
              message={tutorMessage}
              editMessage={setTutorMessage}
              chat={tutorChat}
              diabled={loadingTutorResponse}
            />
          </TutorChatSection>
          <BoardSection>
            <ScenarioHeader>
              <div>
                <ScenarioTitle>{scenario.title}</ScenarioTitle>
                <ScenarioMeta>
                  <ScenarioTag>{scenario.type}</ScenarioTag>
                  <DifficultyBadge difficulty={scenario.difficulty}>
                    {DIFFICULTY_LABELS[scenario.difficulty]}
                  </DifficultyBadge>
                </ScenarioMeta>
              </div>
              <ProfileList>
                <ProfileCard>
                  <ProfileHeading>Woodland Alliance</ProfileHeading>
                  <ProfileDetail>Level · {scenario.allianceProfile.proficiencyLevel}</ProfileDetail>
                  <ProfileDetail>Style · {scenario.allianceProfile.playStyle}</ProfileDetail>
                </ProfileCard>
                <ProfileCard>
                  <ProfileHeading>Eyrie Dynasties</ProfileHeading>
                  <ProfileDetail>Level · {scenario.eyrieProfile.proficiencyLevel}</ProfileDetail>
                  <ProfileDetail>Style · {scenario.eyrieProfile.playStyle}</ProfileDetail>
                </ProfileCard>
              </ProfileList>
            </ScenarioHeader>
            <GameBoardWrapper>
              <GameBoard definition={WOODLAND_BOARD_DEFINITION} state={gameState} />
            </GameBoardWrapper>
            <HudGrid>
              <HudPanel>
                <HudTitle>Turn Summary</HudTitle>
                <TurnMeta>
                  <TurnRow>
                    <span>Current</span>
                    <strong>{FACTION_META[gameState.turn.currentFaction].label}</strong>
                  </TurnRow>
                  <TurnRow>
                    <span>Phase</span>
                    <strong>{gameState.turn.phase}</strong>
                  </TurnRow>
                  <TurnRow>
                    <span>Round</span>
                    <strong>{gameState.turn.roundNumber}</strong>
                  </TurnRow>
                  {gameState.turn.actionSubstep && (
                    <TurnRow>
                      <span>Substep</span>
                      <strong>{gameState.turn.actionSubstep}</strong>
                    </TurnRow>
                  )}
                  <TurnRow>
                    <span>Cats VP</span>
                    <strong>
                      {gameState.victoryTrack.marquise}/{VICTORY_TARGET}
                    </strong>
                  </TurnRow>
                </TurnMeta>
                <ActionButtonRow>
                  <ActionButton onClick={advancePhase}>Advance phase</ActionButton>
                  <ActionButton onClick={advanceFaction}>Pass turn</ActionButton>
                  <ActionButton onClick={resetGameState}>Reset scenario</ActionButton>
                </ActionButtonRow>
              </HudPanel>
              <HudPanel>
                <HudTitle>Faction Logistics</HudTitle>
                <LogisticsList>
                  {logistics.map(item => (
                    <LogisticsRow key={item.id}>
                      <LogisticsHeader>
                        <LogisticsLabel>{FACTION_META[item.id].label}</LogisticsLabel>
                        <LogisticsVictory>
                          {item.victory} / {VICTORY_TARGET} VP
                        </LogisticsVictory>
                      </LogisticsHeader>
                      <LogisticsValue>{item.primary}</LogisticsValue>
                      <LogisticsMeta>{item.secondary}</LogisticsMeta>
                      <LogisticsTags>
                        {item.tags.map(tag => (
                          <ScenarioTag key={tag}>{tag}</ScenarioTag>
                        ))}
                      </LogisticsTags>
                    </LogisticsRow>
                  ))}
                </LogisticsList>
              </HudPanel>
            </HudGrid>
          </BoardSection>
          <PlayerChatSection>
            <ChatContainer ref={playerChatRef}>
              <ChatViewer
                conversation={playerConversation}
                isReplying={loadingAllianceResponse || loadingEyrieResponse}
              />
            </ChatContainer>
            <ChatInput message={playerMessage} editMessage={setPlayerMessage} chat={playerChat} diabled={false} />
          </PlayerChatSection>
        </Container>
      </main>
    </ThemeProvider>
  )
}

const Container = styled.div`
  display: grid;
  grid-template-columns: clamp(300px, 22vw, 360px) minmax(0, 1fr) clamp(300px, 22vw, 360px);
  gap: 16px;
  padding: 16px;
  min-height: 100vh;
  box-sizing: border-box;
  align-items: stretch;
  background: radial-gradient(circle at 10% 20%, rgba(255, 255, 255, 0.25), transparent 45%),
    radial-gradient(circle at 90% 0%, rgba(255, 255, 255, 0.2), transparent 35%);

  @media (max-width: 1400px) {
    grid-template-columns: 1fr;
  }
`

const ColumnSection = styled.div`
  border-radius: 18px;
  border: 3px solid #3d2a18;
  background: #fffdf7;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  padding: 12px;
  min-height: 0;
  gap: 8px;
  min-width: 0;
  max-height: calc(100vh - 32px);
  box-sizing: border-box;

  @media (max-width: 1400px) {
    max-height: none;
  }
`

const TutorChatSection = styled(ColumnSection)``

const PlayerChatSection = styled(ColumnSection)``

const ChatContainer = styled.div`
  overflow-y: auto;
  min-height: 0;
`

const BoardSection = styled.section`
  /* border: 3px solid #3d2a18; */
  border-radius: 20px;
  /* background: linear-gradient(180deg, #fef5dd 0%, #f4dfb8 100%); */
  /* padding: 16px; */
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 16px;
  min-height: 0;
  min-width: 0;
`

const ScenarioHeader = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
`

const ScenarioTitle = styled.h2`
  margin: 0;
  font-size: 26px;
  color: #2a170c;
`

const ScenarioMeta = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 6px;
`

const ScenarioTag = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(61, 42, 24, 0.12);
  color: #3d2a18;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
`

const DifficultyBadge = styled(ScenarioTag)<{ difficulty: number }>`
  ${({ difficulty }) => css`
    background: ${difficulty === 0 ? '#2f8c5b22' : difficulty === 1 ? '#d99b3d33' : '#c94a3d33'};
  `}
`

const ProfileList = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`

const ProfileCard = styled.div`
  min-width: 180px;
  background: rgba(255, 255, 255, 0.9);
  border: 2px solid #d9c19a;
  border-radius: 12px;
  padding: 8px 12px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
`

const ProfileHeading = styled.div`
  font-weight: 700;
  color: #3d2a18;
  margin-bottom: 4px;
`

const ProfileDetail = styled.div`
  font-size: 12px;
  color: #5a4632;
`

const GameBoardWrapper = styled.div`
  min-height: 0;
  display: flex;
  align-items: stretch;
  justify-content: center;
  width: 100%;
  min-width: 0;
  overflow: hidden;
`

const HudGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
  min-width: 0;
`

const HudPanel = styled.div`
  background: rgba(255, 255, 255, 0.93);
  border: 2px solid #d0b084;
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
`

const HudTitle = styled.h3`
  margin: 0 0 12px;
  font-size: 16px;
  color: #2a170c;
`

const TurnMeta = styled.div`
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
`

const TurnRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #4a3520;

  strong {
    font-size: 14px;
    color: #1f1205;
  }
`

const ActionButtonRow = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`

const ActionButton = styled.button`
  border: none;
  border-radius: 999px;
  background: #3d2a18;
  color: white;
  padding: 6px 14px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  font-size: 11px;
  cursor: pointer;
  transition: opacity 120ms ease, transform 120ms ease;

  :hover {
    opacity: 0.9;
  }

  :active {
    transform: translateY(1px);
  }
`

const LogisticsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const LogisticsRow = styled.div`
  border: 1px solid rgba(61, 42, 24, 0.15);
  border-radius: 10px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.92);
`

const LogisticsHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
`

const LogisticsLabel = styled.div`
  font-weight: 700;
  color: #2a170c;
  margin-bottom: 0;
`

const LogisticsVictory = styled.span`
  font-size: 12px;
  font-weight: 700;
  color: #1f1205;
  background: rgba(61, 42, 24, 0.08);
  border-radius: 999px;
  padding: 2px 10px;
  white-space: nowrap;
`

const LogisticsValue = styled.div`
  font-size: 13px;
  color: #4a3520;
`

const LogisticsMeta = styled.div`
  font-size: 12px;
  color: #6a5340;
  margin-bottom: 6px;
`

const LogisticsTags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`
