'use client'
import { ChatInput } from '@/components/chatInput'
import { ChatViewer } from '@/components/chatViewer'
import { GameBoard } from '@/components/gameBoard'
import { SCENARIOS } from '@/constants/scenarios'
import { WOODLAND_BOARD_DEFINITION } from '@/gameState/boardDefinition'
import { summarizeGameState } from '@/gameState/actions'
import { getNextFaction, getNextPhase, getScenarioGameState } from '@/gameState/scenarioState'
import { DecreeColumn, FactionId, GameState, MARQUISE_BUILDING_TRACKS, MARQUISE_TOTAL_WOOD } from '@/gameState/schema'
import { useMultiPartyChat } from '@/hooks/useMultiPartyChat_realtime'
import { TUTOR_SYSTEM_PROMPT } from '@/prompts/tutor'
import { useChatCompleteMutation } from '@/redux/api/common'
import { ThemeProvider, css } from '@emotion/react'
import styled from '@emotion/styled'
import { DEFAULT_LIGHT_THEME } from '@wookiejin/react-component'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SimulateActionResponse } from '../api/game/simulate/route'
import { ChatCompletionParams } from '../api/chatComplete/route'

export type MultiPartyChat = (ChatCompletionParams['conversation'][number] & {
  faction?: 'cat' | 'alliance' | 'eyrie'
})[]

type SimulatableFaction = Exclude<FactionId, 'marquise'>

type AIActionHistoryEntry = {
  id: string
  faction: FactionId
  action: string
  reasoning: string
  timestamp: number
}

const DIFFICULTY_LABELS = ['Easy', 'Medium', 'Hard'] as const

const FACTION_META: Record<FactionId, { label: string; color: string }> = {
  marquise: { label: 'Marquise de Cat', color: '#d96a3d' },
  eyrie: { label: 'Eyrie Dynasties', color: '#4a90e2' },
  woodland_alliance: { label: 'Woodland Alliance', color: '#27ae60' },
}

const isSimulatableFaction = (faction: FactionId): faction is SimulatableFaction =>
  faction === 'eyrie' || faction === 'woodland_alliance'

const VICTORY_TARGET = 30
const formatPhaseLabel = (phase: GameState['turn']['phase']) => phase.charAt(0).toUpperCase() + phase.slice(1)

type EyrieDecreeAction = Extract<SimulateActionResponse['action']['type'], 'recruit' | 'move' | 'battle' | 'build'>

const buildEyrieDecreeSteps = (state: GameState): EyrieDecreeAction[] =>
  (['recruit', 'move', 'battle', 'build'] as EyrieDecreeAction[]).flatMap(column =>
    Array.from({ length: state.factions.eyrie.decree.columns[column as DecreeColumn].length }, () => column)
  )

const formatDiplomacyContext = (conversation: MultiPartyChat) => {
  const recent = conversation.filter(message => message.role !== 'system').slice(-6)
  if (!recent.length) return 'No recent table talk.'
  return recent
    .map(message => {
      const speaker =
        message.faction === 'cat'
          ? 'Cats'
          : message.faction === 'eyrie'
          ? 'Eyrie'
          : message.faction === 'alliance'
          ? 'Alliance'
          : message.role === 'user'
          ? 'Cats'
          : 'Tutor'
      return `${speaker}: ${message.content}`
    })
    .join('\n')
}

function LearnPageContent() {
  const searchParams = useSearchParams()
  const scenarioIndex = Number(searchParams.get('scenario') ?? 0)
  const scenario =
    scenarioIndex < 0
      ? (JSON.parse(localStorage.getItem('customScenario') ?? '') as (typeof SCENARIOS)[number])
      : SCENARIOS[scenarioIndex]
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
        boardState: boardSummary,
        playerAction: lastPlayerAction,
        socialConversation: playerConversation,
      }),
    [boardSummary, lastPlayerAction, playerConversation]
  )

  const clearingDefinitionMap = useMemo(() => {
    const map = new Map<string, (typeof WOODLAND_BOARD_DEFINITION.clearings)[number]>()
    WOODLAND_BOARD_DEFINITION.clearings.forEach(def => map.set(def.id, def))
    return map
  }, [])

  // March action state
  const [isMarchMode, setIsMarchMode] = useState(false)
  const [marchFromClearing, setMarchFromClearing] = useState<string | null>(null)
  const [marchToClearing, setMarchToClearing] = useState<string | null>(null)
  const [marchWarriorCount, setMarchWarriorCount] = useState(1)

  // Battle action state
  const [isBattleMode, setIsBattleMode] = useState(false)
  const [battleClearing, setBattleClearing] = useState<string | null>(null)
  const [battleDefender, setBattleDefender] = useState<FactionId | null>(null)

  // Build action state
  const [buildMode, setBuildMode] = useState<'sawmill' | 'workshop' | 'recruiter' | null>(null)
  const [buildClearing, setBuildClearing] = useState<string | null>(null)

  // Recruit action state
  const [isRecruitMode, setIsRecruitMode] = useState(false)

  // Place wood action state
  const [isPlaceWoodMode, setIsPlaceWoodMode] = useState(false)
  const [placeWoodClearing, setPlaceWoodClearing] = useState<string | null>(null)

  // AI simulation state
  const [aiActionHistory, setAiActionHistory] = useState<AIActionHistoryEntry[]>([])
  const [isSimulatingAction, setIsSimulatingAction] = useState(false)

  // Game manager state
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(false)
  const [waitingForPlayerAction, setWaitingForPlayerAction] = useState(false)
  const [actionsThisPhase, setActionsThisPhase] = useState(0)
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastTurnRef = useRef<{ faction: FactionId; phase: string }>({
    faction: gameState.turn.currentFaction,
    phase: gameState.turn.phase,
  })
  const [eyrieDecreePlan, setEyrieDecreePlan] = useState<{ steps: EyrieDecreeAction[]; total: number }>({
    steps: [],
    total: 0,
  })
  const eyriePendingActionsRef = useRef<EyrieDecreeAction[]>([])
  useEffect(() => {
    eyriePendingActionsRef.current = eyrieDecreePlan.steps.slice()
  }, [eyrieDecreePlan.steps])

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

  useEffect(() => {
    const isEyrieDaylight = gameState.turn.currentFaction === 'eyrie' && gameState.turn.phase === 'daylight'
    if (isEyrieDaylight && actionsThisPhase === 0) {
      const steps = buildEyrieDecreeSteps(gameState)
      setEyrieDecreePlan({ steps, total: steps.length })
      return
    }
    if (!isEyrieDaylight) {
      if (eyrieDecreePlan.steps.length || eyrieDecreePlan.total) {
        setEyrieDecreePlan({ steps: [], total: 0 })
      }
    }
  }, [
    gameState.turn.currentFaction,
    gameState.turn.phase,
    gameState.factions.eyrie.decree,
    actionsThisPhase,
    eyrieDecreePlan.steps.length,
    eyrieDecreePlan.total,
  ])

  const cloneGameState = useCallback((value: GameState) => JSON.parse(JSON.stringify(value)) as GameState, [])

  const advancePhase = useCallback(() => {
    let description = ''
    setGameState(prev => {
      const next = cloneGameState(prev)
      const actingFaction = next.turn.currentFaction
      const previousPhase = next.turn.phase
      const newPhase = getNextPhase(previousPhase)
      description = `Advanced ${FACTION_META[actingFaction].label} from ${formatPhaseLabel(
        previousPhase
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
      if (next.turn.currentFaction === 'marquise' && newPhase === 'birdsong') {
        next.factions.marquise.woodInSupply = MARQUISE_TOTAL_WOOD
      }
      return next
    })
    setLastPlayerAction(description || 'Advanced phase')
    setActionsThisPhase(0)
    setWaitingForPlayerAction(false)
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
    setAutoPlayEnabled(false)
    setWaitingForPlayerAction(false)
    setActionsThisPhase(0)
    lastTurnRef.current = {
      faction: getScenarioGameState(scenarioIndex).turn.currentFaction,
      phase: getScenarioGameState(scenarioIndex).turn.phase,
    }
  }, [scenarioIndex, scenario.title])

  const handlePlayerActionComplete = useCallback(() => {
    if (gameState.turn.currentFaction === 'marquise') {
      setActionsThisPhase(prev => prev + 1)
      setWaitingForPlayerAction(true)
    }
  }, [gameState.turn.currentFaction])

  const canPlayerTakeAction = useCallback(() => {
    if (gameState.turn.currentFaction !== 'marquise') {
      return true // Not player's turn, allow all actions
    }

    // Check action limits based on phase
    if (gameState.turn.phase === 'birdsong') {
      return actionsThisPhase < 1 // Birdsong: 1 action
    } else if (gameState.turn.phase === 'daylight') {
      return actionsThisPhase < 3 // Daylight: 3 actions
    } else if (gameState.turn.phase === 'evening') {
      return actionsThisPhase < 1 // Evening: 1 action
    }

    return true
  }, [gameState.turn.currentFaction, gameState.turn.phase, actionsThisPhase])

  // March action handlers
  const toggleMarch = useCallback(() => {
    if (isMarchMode) {
      // Turn off march mode
      setIsMarchMode(false)
      setMarchFromClearing(null)
      setMarchToClearing(null)
      setMarchWarriorCount(1)
    } else {
      // Turn on march mode, turn off other modes
      setIsMarchMode(true)
      setMarchFromClearing(null)
      setMarchToClearing(null)
      setMarchWarriorCount(1)
      setIsBattleMode(false)
      setBattleClearing(null)
      setBattleDefender(null)
      setBuildMode(null)
      setBuildClearing(null)
      setIsRecruitMode(false)
      setIsPlaceWoodMode(false)
      setPlaceWoodClearing(null)
    }
  }, [isMarchMode])

  const cancelMarch = useCallback(() => {
    setIsMarchMode(false)
    setMarchFromClearing(null)
    setMarchToClearing(null)
    setMarchWarriorCount(1)
  }, [])

  // Get valid clearings and warrior counts for march planning
  const validFromClearings = useMemo(() => {
    if (!isMarchMode || marchFromClearing) return []

    return Object.entries(gameState.board.clearings)
      .filter(([, clearing]) => (clearing.warriors.marquise ?? 0) > 0)
      .map(([id]) => id)
  }, [isMarchMode, marchFromClearing, gameState.board.clearings])

  const validToClearings = useMemo(() => {
    if (!isMarchMode || !marchFromClearing || marchToClearing) return []

    const fromClearing = WOODLAND_BOARD_DEFINITION.clearings.find(c => c.id === marchFromClearing)
    if (!fromClearing) return []

    return fromClearing.adjacentClearings
  }, [isMarchMode, marchFromClearing, marchToClearing])

  const maxWarriors = useMemo(() => {
    if (!marchFromClearing) return 0
    return gameState.board.clearings[marchFromClearing]?.warriors.marquise ?? 0
  }, [marchFromClearing, gameState.board.clearings])

  const canExecuteMarchAction = Boolean(marchFromClearing && marchToClearing)

  const handleClearingClick = useCallback(
    (clearingId: string) => {
      if (!isMarchMode) return

      if (!marchFromClearing) {
        // First click - select source clearing
        setMarchFromClearing(clearingId)
        setMarchWarriorCount(1)
      } else if (!marchToClearing) {
        // Second click - select destination clearing
        if (clearingId === marchFromClearing) {
          // Clicked same clearing - deselect
          setMarchFromClearing(null)
        } else {
          setMarchToClearing(clearingId)
        }
      }
    },
    [isMarchMode, marchFromClearing, marchToClearing]
  )

  const executeMarch = useCallback(async () => {
    if (!marchFromClearing || !marchToClearing) return

    try {
      const response = await fetch('/api/game/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: gameState,
          faction: 'marquise',
          from: marchFromClearing,
          to: marchToClearing,
          warriors: marchWarriorCount,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        alert((error as { error?: string }).error || 'Failed to execute march')
        return
      }

      const data = await response.json()
      setGameState(data.state)

      const description = `Moved ${marchWarriorCount} warrior(s) from #${marchFromClearing.toUpperCase()} to #${marchToClearing.toUpperCase()}`
      setLastPlayerAction(description)
      setAiActionHistory(prev => [
        ...prev,
        {
          id: `marquise_${Date.now()}`,
          faction: 'marquise',
          action: description,
          reasoning: '',
          timestamp: Date.now(),
        },
      ])

      setMarchFromClearing(null)
      setMarchToClearing(null)
      setMarchWarriorCount(1)
      handlePlayerActionComplete()
    } catch (error) {
      console.error('March error:', error)
      alert('Failed to execute march')
    }
  }, [marchFromClearing, marchToClearing, marchWarriorCount, gameState, handlePlayerActionComplete])
  const nextEyrieAction = eyrieDecreePlan.steps[0]

  // Battle action handlers
  const toggleBattle = useCallback(() => {
    if (isBattleMode) {
      setIsBattleMode(false)
      setBattleClearing(null)
      setBattleDefender(null)
    } else {
      // Turn on battle mode, turn off other modes
      setIsBattleMode(true)
      setBattleClearing(null)
      setBattleDefender(null)
      setIsMarchMode(false)
      setMarchFromClearing(null)
      setMarchToClearing(null)
      setMarchWarriorCount(1)
      setBuildMode(null)
      setBuildClearing(null)
      setIsRecruitMode(false)
      setIsPlaceWoodMode(false)
      setPlaceWoodClearing(null)
    }
  }, [isBattleMode])

  const cancelBattle = useCallback(() => {
    setIsBattleMode(false)
    setBattleClearing(null)
    setBattleDefender(null)
  }, [])

  const handleBattleClearingClick = useCallback(
    (clearingId: string) => {
      if (!isBattleMode) return
      setBattleClearing(clearingId)
      setBattleDefender(null)
    },
    [isBattleMode]
  )

  const executeBattle = useCallback(async () => {
    if (!battleClearing || !battleDefender) return

    try {
      const response = await fetch('/api/game/battle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: gameState,
          clearingId: battleClearing,
          attacker: 'marquise',
          defender: battleDefender,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        alert(error.error || 'Failed to execute battle')
        return
      }

      const data = await response.json()
      setGameState(data.state)

      // Show detailed battle results
      const attackerName = 'Marquise de Cat'
      const defenderName = FACTION_META[battleDefender].label

      let resultMessage = `🗡️ Battle Results in Clearing #${battleClearing.toUpperCase()}\n\n`

      // Dice rolls
      resultMessage += `📊 Dice Rolls:\n`
      resultMessage += `Attacker (${attackerName}): ${data.dice[0]}\n`
      resultMessage += `Defender (${defenderName}): ${data.dice[1]}\n\n`

      // Hits breakdown
      resultMessage += `💥 Hits Dealt:\n`
      resultMessage += `${attackerName}: ${data.attackerHits} total`
      if (data.attackerExtraHits > 0) {
        resultMessage += ` (${data.attackerRolledHits} rolled + ${data.attackerExtraHits} extra)`
      }
      resultMessage += `\n`
      resultMessage += `${defenderName}: ${data.defenderHits} total`
      if (data.defenderExtraHits > 0) {
        resultMessage += ` (${data.defenderRolledHits} rolled + ${data.defenderExtraHits} extra)`
      }
      resultMessage += `\n\n`

      // Casualties
      resultMessage += `☠️ Casualties:\n`
      resultMessage += `${defenderName} lost:\n`
      if (data.defenderWarriorsRemoved > 0) {
        resultMessage += `  - ${data.defenderWarriorsRemoved} warrior(s)\n`
      }
      if (data.defenderBuildingsRemoved.length > 0) {
        resultMessage += `  - ${data.defenderBuildingsRemoved.length} building(s)\n`
      }
      if (data.defenderTokensRemoved.length > 0) {
        resultMessage += `  - ${data.defenderTokensRemoved.length} token(s)\n`
      }

      resultMessage += `${attackerName} lost:\n`
      if (data.attackerWarriorsRemoved > 0) {
        resultMessage += `  - ${data.attackerWarriorsRemoved} warrior(s)\n`
      }
      if (data.attackerBuildingsRemoved.length > 0) {
        resultMessage += `  - ${data.attackerBuildingsRemoved.length} building(s)\n`
      }
      if (data.attackerTokensRemoved.length > 0) {
        resultMessage += `  - ${data.attackerTokensRemoved.length} token(s)\n`
      }

      // Victory points
      if (data.victoryPointsEarned.attacker > 0 || data.victoryPointsEarned.defender > 0) {
        resultMessage += `\n⭐ Victory Points Earned:\n`
        if (data.victoryPointsEarned.attacker > 0) {
          resultMessage += `${attackerName}: +${data.victoryPointsEarned.attacker} VP\n`
        }
        if (data.victoryPointsEarned.defender > 0) {
          resultMessage += `${defenderName}: +${data.victoryPointsEarned.defender} VP\n`
        }
      }

      alert(resultMessage)

      const description = `Battled ${FACTION_META[battleDefender].label} in clearing #${battleClearing.toUpperCase()}`
      setLastPlayerAction(description)
      setAiActionHistory(prev => [
        ...prev,
        {
          id: `marquise_${Date.now()}`,
          faction: 'marquise',
          action: description,
          reasoning: '',
          timestamp: Date.now(),
        },
      ])

      cancelBattle()
      handlePlayerActionComplete()
    } catch (error) {
      console.error('Battle error:', error)
      alert('Failed to execute battle')
    }
  }, [battleClearing, battleDefender, gameState, cancelBattle, handlePlayerActionComplete])

  // Get valid clearings for battle selection
  const validBattleClearings = useMemo(() => {
    if (!isBattleMode || battleClearing) return []

    return Object.entries(gameState.board.clearings)
      .filter(([, clearing]) => {
        const marquiseWarriors = clearing.warriors.marquise ?? 0
        // Check if there are any enemy pieces (warriors, buildings, or tokens)
        const hasEnemyPieces =
          Object.entries(clearing.warriors).some(([faction]) => faction !== 'marquise') ||
          clearing.buildings.some(b => b.faction !== 'marquise') ||
          clearing.tokens.some(t => t.faction !== 'marquise')
        return marquiseWarriors > 0 && hasEnemyPieces
      })
      .map(([id]) => id)
  }, [isBattleMode, battleClearing, gameState.board.clearings])

  // Get available defenders in selected clearing
  const availableDefenders = useMemo(() => {
    if (!battleClearing) return []

    const clearing = gameState.board.clearings[battleClearing]
    if (!clearing) return []

    // Get all factions with any pieces in the clearing (warriors, buildings, or tokens)
    const factionsWithPieces = new Set<FactionId>()

    Object.entries(clearing.warriors).forEach(([faction]) => {
      if (faction !== 'marquise') {
        factionsWithPieces.add(faction as FactionId)
      }
    })

    clearing.buildings.forEach(building => {
      if (building.faction !== 'marquise') {
        factionsWithPieces.add(building.faction)
      }
    })

    clearing.tokens.forEach(token => {
      if (token.faction !== 'marquise') {
        factionsWithPieces.add(token.faction)
      }
    })

    return Array.from(factionsWithPieces)
  }, [battleClearing, gameState.board.clearings])

  // Build action handlers
  const toggleBuildSawmill = useCallback(() => {
    if (buildMode === 'sawmill') {
      setBuildMode(null)
      setBuildClearing(null)
    } else {
      // Turn on sawmill build mode, turn off other modes
      setBuildMode('sawmill')
      setBuildClearing(null)
      setIsMarchMode(false)
      setMarchFromClearing(null)
      setMarchToClearing(null)
      setMarchWarriorCount(1)
      setIsBattleMode(false)
      setBattleClearing(null)
      setBattleDefender(null)
      setIsRecruitMode(false)
      setIsPlaceWoodMode(false)
      setPlaceWoodClearing(null)
    }
  }, [buildMode])

  const toggleBuildWorkshop = useCallback(() => {
    if (buildMode === 'workshop') {
      setBuildMode(null)
      setBuildClearing(null)
    } else {
      // Turn on workshop build mode, turn off other modes
      setBuildMode('workshop')
      setBuildClearing(null)
      setIsMarchMode(false)
      setMarchFromClearing(null)
      setMarchToClearing(null)
      setMarchWarriorCount(1)
      setIsBattleMode(false)
      setBattleClearing(null)
      setBattleDefender(null)
      setIsRecruitMode(false)
      setIsPlaceWoodMode(false)
      setPlaceWoodClearing(null)
    }
  }, [buildMode])

  const toggleBuildRecruiter = useCallback(() => {
    if (buildMode === 'recruiter') {
      setBuildMode(null)
      setBuildClearing(null)
    } else {
      // Turn on recruiter build mode, turn off other modes
      setBuildMode('recruiter')
      setBuildClearing(null)
      setIsMarchMode(false)
      setMarchFromClearing(null)
      setMarchToClearing(null)
      setMarchWarriorCount(1)
      setIsBattleMode(false)
      setBattleClearing(null)
      setBattleDefender(null)
      setIsRecruitMode(false)
      setIsPlaceWoodMode(false)
      setPlaceWoodClearing(null)
    }
  }, [buildMode])

  const cancelBuild = useCallback(() => {
    setBuildMode(null)
    setBuildClearing(null)
  }, [])

  const handleBuildClearingClick = useCallback(
    (clearingId: string) => {
      if (!buildMode) return
      setBuildClearing(clearingId)
    },
    [buildMode]
  )

  const executeBuild = useCallback(async () => {
    if (!buildMode || !buildClearing) return

    try {
      const response = await fetch('/api/game/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: gameState,
          faction: 'marquise',
          clearingId: buildClearing,
          buildingType: buildMode,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        alert(error.error || 'Failed to build')
        return
      }

      const data = await response.json()
      setGameState(data.state)

      // Calculate VP earned
      const track = gameState.factions.marquise.buildingTracks[buildMode]
      const trackDef = MARQUISE_BUILDING_TRACKS[buildMode]
      const vpEarned = trackDef.steps[track.builtCount].victoryPoints
      const woodCost = trackDef.steps[track.builtCount].costWood

      alert(
        `🏛️ Successfully built ${buildMode} in clearing #${buildClearing.toUpperCase()}\n\n` +
          `Wood spent: ${woodCost}\n` +
          `Victory Points earned: ${vpEarned}\n` +
          `New VP total: ${data.state.victoryTrack.marquise}`
      )

      const description = `Built ${buildMode} in clearing #${buildClearing.toUpperCase()}`
      setLastPlayerAction(description)
      setAiActionHistory(prev => [
        ...prev,
        {
          id: `marquise_${Date.now()}`,
          faction: 'marquise',
          action: description,
          reasoning: '',
          timestamp: Date.now(),
        },
      ])

      cancelBuild()
      handlePlayerActionComplete()
    } catch (error) {
      console.error('Build error:', error)
      alert('Failed to build')
    }
  }, [buildMode, buildClearing, gameState, cancelBuild, handlePlayerActionComplete])

  // Get valid clearings for building
  const validBuildClearings = useMemo(() => {
    if (!buildMode || buildClearing) return []

    return Object.entries(gameState.board.clearings)
      .filter(([clearingId, clearing]) => {
        const marquiseWarriors = clearing.warriors.marquise ?? 0
        if (marquiseWarriors === 0) return false

        // Check if clearing has available building slots
        const clearingDef = WOODLAND_BOARD_DEFINITION.clearings.find(c => c.id === clearingId)
        if (!clearingDef) return false

        return clearing.buildings.length < clearingDef.buildingSlots
      })
      .map(([id]) => id)
  }, [buildMode, buildClearing, gameState.board.clearings])

  // Recruit action handlers
  const toggleRecruit = useCallback(() => {
    if (isRecruitMode) {
      setIsRecruitMode(false)
    } else {
      setIsRecruitMode(true)
      setIsMarchMode(false)
      setMarchFromClearing(null)
      setMarchToClearing(null)
      setMarchWarriorCount(1)
      setIsBattleMode(false)
      setBattleClearing(null)
      setBattleDefender(null)
      setBuildMode(null)
      setBuildClearing(null)
      setIsPlaceWoodMode(false)
      setPlaceWoodClearing(null)
    }
  }, [isRecruitMode])

  const cancelRecruit = useCallback(() => {
    setIsRecruitMode(false)
  }, [])

  const executeRecruit = useCallback(async () => {
    try {
      const response = await fetch('/api/game/recruit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: gameState,
          faction: 'marquise',
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        alert(error.error || 'Failed to recruit')
        return
      }

      const data = await response.json()
      setGameState(data.state)

      const placementSummary = data.placements
        .map((placement: { clearingId: string; warriorsPlaced: number }) => {
          return `#${placement.clearingId.toUpperCase()} (+${placement.warriorsPlaced})`
        })
        .join(', ')

      alert(
        `⚔️ Recruited ${data.totalPlaced} warrior(s) across all recruiters.\n\n` +
          `${placementSummary || 'No placements were possible.'}\n` +
          `Warriors in supply: ${data.state.factions.marquise.warriorsInSupply}`
      )

      const description = `Recruited ${data.totalPlaced} warrior(s): ${placementSummary || 'No placements possible.'}`
      setLastPlayerAction(description)
      setAiActionHistory(prev => [
        ...prev,
        {
          id: `marquise_${Date.now()}`,
          faction: 'marquise',
          action: description,
          reasoning: '',
          timestamp: Date.now(),
        },
      ])

      cancelRecruit()
      handlePlayerActionComplete()
    } catch (error) {
      console.error('Recruit error:', error)
      alert('Failed to recruit')
    }
  }, [gameState, cancelRecruit, handlePlayerActionComplete])

  const computeEyrieFallbackAction = useCallback(
    (state: GameState, actionType?: EyrieDecreeAction): SimulateActionResponse['action'] | null => {
      if (!actionType) return null
      const boardEntries = Object.entries(state.board.clearings)
      const suitMatches = (clearingId: string, column: DecreeColumn) => {
        const cards = state.factions.eyrie.decree.columns[column]
        if (!cards.length) return true
        const suit = cards[0].suit
        if (suit === 'bird') return true
        const def = clearingDefinitionMap.get(clearingId)
        return def?.suit === suit
      }

      if (actionType === 'recruit') {
        if (state.factions.eyrie.warriorsInSupply <= 0) return null
        const roostEntry = boardEntries.find(
          ([id, clearing]) =>
            clearing.buildings.some(b => b.faction === 'eyrie' && b.type === 'roost') && suitMatches(id, 'recruit')
        )
        if (!roostEntry) return null
        return { type: 'recruit', clearingId: roostEntry[0], warriors: 1 }
      }

      if (actionType === 'move') {
        for (const [id, clearing] of boardEntries) {
          if (!suitMatches(id, 'move')) continue
          const warriors = clearing.warriors.eyrie ?? 0
          if (warriors <= 1) continue
          const def = clearingDefinitionMap.get(id)
          if (!def) continue
          for (const adj of def.adjacentClearings) {
            if (!state.board.clearings[adj]) continue
            const moving = Math.max(1, warriors - 1)
            return { type: 'move', from: id, to: adj, warriors: moving }
          }
        }
        return null
      }

      if (actionType === 'battle') {
        for (const [id, clearing] of boardEntries) {
          if (!suitMatches(id, 'battle')) continue
          const warriors = clearing.warriors.eyrie ?? 0
          if (warriors === 0) continue
          const defenderWarrior = Object.entries(clearing.warriors).find(
            ([factionId, count]) => factionId !== 'eyrie' && (count ?? 0) > 0
          )
          if (defenderWarrior) {
            return { type: 'battle', clearingId: id, defender: defenderWarrior[0] as FactionId }
          }
          const defenderBuilding = clearing.buildings.find(b => b.faction !== 'eyrie')
          if (defenderBuilding) {
            return { type: 'battle', clearingId: id, defender: defenderBuilding.faction }
          }
          const defenderToken = clearing.tokens.find(t => t.faction !== 'eyrie')
          if (defenderToken) {
            return { type: 'battle', clearingId: id, defender: defenderToken.faction }
          }
        }
        return null
      }

      if (actionType === 'build') {
        for (const [id, clearing] of boardEntries) {
          if (!suitMatches(id, 'build')) continue
          if (clearing.buildings.some(b => b.faction === 'eyrie' && b.type === 'roost')) continue
          const def = clearingDefinitionMap.get(id)
          if (!def) continue
          if (clearing.buildings.length >= def.buildingSlots) continue
          const eyrieWarriors = clearing.warriors.eyrie ?? 0
          if (eyrieWarriors === 0) continue
          const enemyStrength = Object.entries(clearing.warriors)
            .filter(([factionId]) => factionId !== 'eyrie')
            .reduce((sum, [, count]) => sum + (count ?? 0), 0)
          if (eyrieWarriors < enemyStrength) continue
          return { type: 'build', clearingId: id, buildingType: 'roost' }
        }
      }

      return null
    },
    [clearingDefinitionMap]
  )

  const recruitTargets = useMemo(() => {
    return Object.entries(gameState.board.clearings)
      .map(([clearingId, clearing]) => {
        const recruiters = clearing.buildings.filter(b => b.faction === 'marquise' && b.type === 'recruiter').length
        return recruiters > 0
          ? {
              clearingId,
              recruiters,
            }
          : null
      })
      .filter((entry): entry is { clearingId: string; recruiters: number } => Boolean(entry))
  }, [gameState.board.clearings])

  const validRecruitClearings = useMemo(() => {
    if (!isRecruitMode) return []
    return recruitTargets.map(target => target.clearingId)
  }, [isRecruitMode, recruitTargets])

  const canExecuteRecruit = recruitTargets.length > 0 && (gameState.factions.marquise.warriorsInSupply ?? 0) > 0
  const recruitPreview = useMemo(() => {
    let remaining = gameState.factions.marquise.warriorsInSupply ?? 0
    return recruitTargets.map(target => {
      const willPlace = Math.min(target.recruiters, remaining)
      remaining = Math.max(0, remaining - willPlace)
      return { ...target, willPlace }
    })
  }, [recruitTargets, gameState.factions.marquise.warriorsInSupply])
  const totalPotentialRecruit = recruitPreview.reduce((sum, target) => sum + target.willPlace, 0)

  const runEyrieBirdsong = useCallback(async () => {
    try {
      const response = await fetch('/api/game/eyrie/birdsong', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: gameState }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error((error as { message?: string }).message || 'Eyrie Birdsong failed')
      }
      const data = (await response.json()) as { state: GameState; log: string[] }
      setGameState(data.state)
      const summary = data.log.join(' ')
      setLastPlayerAction(summary || 'Eyrie completed Birdsong.')
      setAiActionHistory(prev => [
        ...prev,
        {
          id: `eyrie_${Date.now()}`,
          faction: 'eyrie',
          action: summary || 'Birdsong complete.',
          reasoning: '',
          timestamp: Date.now(),
        },
      ])
    } catch (error) {
      console.error('Eyrie Birdsong error', error)
      alert(error instanceof Error ? error.message : 'Failed to resolve Eyrie Birdsong')
    }
  }, [gameState])

  const runEyrieEvening = useCallback(async () => {
    try {
      const response = await fetch('/api/game/eyrie/evening', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: gameState }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error((error as { message?: string }).message || 'Eyrie Evening failed')
      }
      const data = (await response.json()) as { state: GameState; log: string[] }
      setGameState(data.state)
      const summary = data.log.join(' ')
      setLastPlayerAction(summary || 'Eyrie completed Evening.')
      setAiActionHistory(prev => [
        ...prev,
        {
          id: `eyrie_${Date.now()}`,
          faction: 'eyrie',
          action: summary || 'Evening complete.',
          reasoning: '',
          timestamp: Date.now(),
        },
      ])
    } catch (error) {
      console.error('Eyrie Evening error', error)
      alert(error instanceof Error ? error.message : 'Failed to resolve Eyrie Evening')
    }
  }, [gameState])

  const runEyrieTurmoil = useCallback(
    async (stateOverride?: GameState) => {
      const payload = stateOverride ?? gameState
      const response = await fetch('/api/game/eyrie/turmoil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: payload }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error((error as { message?: string }).message || 'Failed to resolve Turmoil')
      }
      const data = (await response.json()) as { state: GameState; lostPoints: number }
      setGameState(data.state)
      const summary = `Eyrie fell into Turmoil and lost ${data.lostPoints} VP.`
      setLastPlayerAction(summary)
      setAiActionHistory(prev => [
        ...prev,
        {
          id: `eyrie_${Date.now()}`,
          faction: 'eyrie',
          action: summary,
          reasoning: '',
          timestamp: Date.now(),
        },
      ])
      return data.state
    },
    [gameState]
  )

  const handleEyrieBirdsong = useCallback(async () => {
    if (isSimulatingAction) return
    if (gameState.turn.phase !== 'birdsong' || gameState.turn.currentFaction !== 'eyrie') return
    if (actionsThisPhase > 0) {
      alert('Birdsong already resolved this turn.')
      return
    }
    setIsSimulatingAction(true)
    try {
      await runEyrieBirdsong()
      setActionsThisPhase(1)
      advancePhase()
    } finally {
      setIsSimulatingAction(false)
    }
  }, [
    isSimulatingAction,
    gameState.turn.phase,
    gameState.turn.currentFaction,
    actionsThisPhase,
    runEyrieBirdsong,
    advancePhase,
  ])

  const handleEyrieEvening = useCallback(async () => {
    if (isSimulatingAction) return
    if (gameState.turn.phase !== 'evening' || gameState.turn.currentFaction !== 'eyrie') return
    setIsSimulatingAction(true)
    try {
      await runEyrieEvening()
      setActionsThisPhase(1)
      advancePhase()
    } finally {
      setIsSimulatingAction(false)
    }
  }, [isSimulatingAction, gameState.turn.phase, gameState.turn.currentFaction, runEyrieEvening, advancePhase])

  // Place wood handlers
  const togglePlaceWood = useCallback(() => {
    if (isPlaceWoodMode) {
      setIsPlaceWoodMode(false)
      setPlaceWoodClearing(null)
    } else {
      setIsPlaceWoodMode(true)
      setPlaceWoodClearing(null)
      setIsMarchMode(false)
      setMarchFromClearing(null)
      setMarchToClearing(null)
      setMarchWarriorCount(1)
      setIsBattleMode(false)
      setBattleClearing(null)
      setBattleDefender(null)
      setBuildMode(null)
      setBuildClearing(null)
      setIsRecruitMode(false)
    }
  }, [isPlaceWoodMode])

  const cancelPlaceWood = useCallback(() => {
    setIsPlaceWoodMode(false)
    setPlaceWoodClearing(null)
  }, [])

  const handlePlaceWoodClearingClick = useCallback(
    (clearingId: string) => {
      if (!isPlaceWoodMode) return

      if (gameState.factions.marquise.woodInSupply <= 0) {
        alert('No wood available in supply.')
        return
      }

      const clearing = gameState.board.clearings[clearingId]
      if (!clearing) return

      const sawmillsInClearing = clearing.buildings.filter(b => b.faction === 'marquise' && b.type === 'sawmill').length

      if (sawmillsInClearing === 0) {
        alert('Select a clearing with at least one sawmill.')
        return
      }

      setPlaceWoodClearing(clearingId)
    },
    [gameState.board.clearings, gameState.factions.marquise.woodInSupply, isPlaceWoodMode]
  )

  const executePlaceWood = useCallback(async () => {
    if (!placeWoodClearing) return

    try {
      const response = await fetch('/api/game/placeWood', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: gameState,
          clearingId: placeWoodClearing,
        }),
      })

      if (!response.ok) {
        const raw = await response.text().catch(() => '')
        let parsed: { message?: string } | null = null
        try {
          parsed = raw ? (JSON.parse(raw) as { message?: string }) : null
        } catch {
          parsed = null
        }
        const fallback = raw || 'Failed to place wood'
        throw new Error(parsed?.message ?? fallback)
      }

      const data = await response.json()
      setGameState(data.state)

      const description = `Placed wood in clearing #${placeWoodClearing.toUpperCase()}`
      setLastPlayerAction(description)
      setAiActionHistory(prev => [
        ...prev,
        {
          id: `marquise_${Date.now()}`,
          faction: 'marquise',
          action: description,
          reasoning: '',
          timestamp: Date.now(),
        },
      ])

      cancelPlaceWood()
      handlePlayerActionComplete()
    } catch (error) {
      console.error('Place wood error:', error)
      alert(error instanceof Error ? error.message : 'Failed to place wood')
    }
  }, [cancelPlaceWood, gameState, placeWoodClearing, handlePlayerActionComplete])

  const handleNotImplemented = useCallback(() => {
    alert('This action is not implemented yet.')
  }, [])

  const validPlaceWoodClearings = useMemo(() => {
    if (!isPlaceWoodMode) return []

    return Object.entries(gameState.board.clearings)
      .filter(([, clearing]) => {
        const sawmills = clearing.buildings.filter(b => b.faction === 'marquise' && b.type === 'sawmill').length
        if (sawmills === 0) return false

        return gameState.factions.marquise.woodInSupply > 0
      })
      .map(([id]) => id)
  }, [gameState.board.clearings, gameState.factions.marquise.woodInSupply, isPlaceWoodMode])

  const simulateFactionAction = useCallback(
    async (faction: SimulatableFaction) => {
      if (isSimulatingAction) return
      if (faction === 'eyrie' && gameState.turn.phase !== 'daylight') {
        alert('Eyrie can only simulate Decree actions during Daylight. Resolve Birdsong or Evening first.')
        return
      }
      setIsSimulatingAction(true)
      try {
        const factionHistory = aiActionHistory.filter(entry => entry.faction === faction).slice(-3)
        const enforcedAction: EyrieDecreeAction | undefined =
          faction === 'eyrie' && gameState.turn.phase === 'daylight' ? nextEyrieAction : undefined
        const diplomacyContext = formatDiplomacyContext(playerConversation)

        const pendingActions =
          faction === 'eyrie' && gameState.turn.phase === 'daylight' ? [...eyriePendingActionsRef.current] : undefined
        if (pendingActions && pendingActions.length === 0) {
          setIsSimulatingAction(false)
          schedulePhaseAdvance()
          return
        }

        const requestSimulation = async () => {
          const response = await fetch('/api/game/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              state: gameState,
              faction,
              recentActions: factionHistory.map(entry => ({ action: entry.action })),
              diplomacyContext,
              nextRequiredAction: enforcedAction,
              availableActions: pendingActions,
            }),
          })

          if (!response.ok) {
            const raw = await response.text().catch(() => '')
            let parsed: { message?: string; error?: unknown } | null = null
            try {
              parsed = raw ? (JSON.parse(raw) as { message?: string; error?: unknown }) : null
            } catch {
              parsed = null
            }
            const normalize = (value: unknown): string | undefined => {
              if (!value) return undefined
              if (typeof value === 'string') return value
              if (value instanceof Error) return value.message
              if (typeof value === 'object') {
                const candidate = value as { message?: string; typeName?: string; type?: string }
                return candidate.message ?? candidate.typeName ?? candidate.type ?? JSON.stringify(value)
              }
              return String(value)
            }
            const fallback = raw || response.statusText || 'Failed to simulate action'
            throw new Error(parsed?.message ?? normalize(parsed?.error) ?? fallback)
          }

          return (await response.json()) as SimulateActionResponse
        }

        let simulation: SimulateActionResponse | null = null
        const maxAttempts =
          faction === 'eyrie' && enforcedAction
            ? Math.max(1, pendingActions?.filter(action => action === enforcedAction).length ?? 0)
            : 1
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
          const candidate = await requestSimulation()
          if (faction === 'eyrie' && enforcedAction && candidate.action.type !== enforcedAction) {
            if (attempt === maxAttempts - 1) {
              const fallbackAction = computeEyrieFallbackAction(gameState, enforcedAction)
              if (fallbackAction) {
                simulation = { action: fallbackAction, reasoning: 'fallback decree action' }
              }
            }
            if (!simulation) {
              continue
            }
          } else {
            simulation = candidate
          }
          if (simulation) break
        }

        if (!simulation) {
          if (faction === 'eyrie' && enforcedAction) {
            await runEyrieTurmoil(gameState)
            eyriePendingActionsRef.current = []
          }
          setIsSimulatingAction(false)
          return
        }
        let updatedState = gameState
        let description = ''
        let stateChanged = false

        const applyAction = async (url: string, payload: Record<string, unknown>) => {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (!res.ok) {
            const rawError = await res.text().catch(() => '')
            let parsedError: { message?: string } | null = null
            try {
              parsedError = rawError ? (JSON.parse(rawError) as { message?: string }) : null
            } catch {
              parsedError = null
            }
            const actionName = url.split('/').pop()
            const fallbackMessage = rawError || `Failed to apply simulated ${actionName} action`
            throw new Error(parsedError?.message ?? fallbackMessage)
          }
          return res.json()
        }

        let resolvedByTurmoil = false

        if (faction === 'eyrie' && enforcedAction && simulation.action.type !== enforcedAction) {
          eyriePendingActionsRef.current = []
          await runEyrieTurmoil(updatedState)
          resolvedByTurmoil = true
        } else {
          switch (simulation.action.type) {
            case 'move': {
              try {
                const data = await applyAction('/api/game/move', {
                  state: updatedState,
                  faction,
                  from: simulation.action.from,
                  to: simulation.action.to,
                  warriors: simulation.action.warriors,
                })
                updatedState = data.state
                stateChanged = true
                description = `${FACTION_META[faction].label} moved ${
                  simulation.action.warriors
                } warriors from #${simulation.action.from.toUpperCase()} to #${simulation.action.to.toUpperCase()}`
              } catch (error) {
                console.warn(
                  `Move action failed: ${error instanceof Error ? error.message : 'Unknown error'}. Treating as pass.`
                )
                description = `${
                  FACTION_META[faction].label
                } could not move from #${simulation.action.from.toUpperCase()} to #${simulation.action.to.toUpperCase()} - passed instead`
              }
              break
            }
            case 'battle': {
              try {
                const data = await applyAction('/api/game/battle', {
                  state: updatedState,
                  clearingId: simulation.action.clearingId,
                  attacker: faction,
                  defender: simulation.action.defender,
                })
                updatedState = data.state
                stateChanged = true
                description = `${FACTION_META[faction].label} battled ${
                  FACTION_META[simulation.action.defender].label
                } in #${simulation.action.clearingId.toUpperCase()}`
              } catch (error) {
                console.warn(
                  `Battle action failed: ${error instanceof Error ? error.message : 'Unknown error'}. Treating as pass.`
                )
                description = `${
                  FACTION_META[faction].label
                } could not battle in #${simulation.action.clearingId.toUpperCase()} - passed instead`
              }
              break
            }
            case 'build': {
              try {
                const data = await applyAction('/api/game/build', {
                  state: updatedState,
                  faction,
                  clearingId: simulation.action.clearingId,
                  buildingType: simulation.action.buildingType,
                })
                updatedState = data.state
                stateChanged = true
                const structure =
                  simulation.action.buildingType?.replace(/_/g, ' ') ?? (faction === 'eyrie' ? 'roost' : 'building')
                description = `${
                  FACTION_META[faction].label
                } built ${structure} in #${simulation.action.clearingId.toUpperCase()}`
              } catch (error) {
                // If building fails (e.g., no slots available), treat it as a pass
                console.warn(
                  `Build action failed: ${error instanceof Error ? error.message : 'Unknown error'}. Treating as pass.`
                )
                description = `${
                  FACTION_META[faction].label
                } could not build in #${simulation.action.clearingId.toUpperCase()} (no slots available) - passed instead`
              }
              break
            }
            case 'recruit': {
              try {
                const data = await applyAction('/api/game/recruit', {
                  state: updatedState,
                  faction,
                  clearingId: simulation.action.clearingId,
                  warriors: simulation.action.warriors,
                })
                updatedState = data.state
                stateChanged = true
                const placements = (data.placements ?? []) as { clearingId: string; warriorsPlaced: number }[]
                const placementSummary =
                  placements.length > 0
                    ? placements
                        .map(entry => `#${entry.clearingId.toUpperCase()} (+${entry.warriorsPlaced})`)
                        .join(', ')
                    : 'no placements'
                description = `${FACTION_META[faction].label} recruited ${
                  data.totalPlaced ?? placements.length
                } warrior(s): ${placementSummary}`
              } catch (error) {
                console.warn(
                  `Recruit action failed: ${
                    error instanceof Error ? error.message : 'Unknown error'
                  }. Treating as pass.`
                )
                description = `${FACTION_META[faction].label} could not recruit - passed instead`
              }
              break
            }
            case 'token': {
              if (faction !== 'woodland_alliance') {
                throw new Error('Only the Woodland Alliance can place tokens in this mode')
              }
              try {
                const data = await applyAction('/api/game/token', {
                  state: updatedState,
                  faction,
                  clearingId: simulation.action.clearingId,
                  tokenType: simulation.action.tokenType,
                })
                updatedState = data.state
                stateChanged = true
                description = `${FACTION_META[faction].label} placed a ${
                  simulation.action.tokenType
                } token in #${simulation.action.clearingId.toUpperCase()}`
              } catch (error) {
                console.warn(
                  `Token placement failed: ${
                    error instanceof Error ? error.message : 'Unknown error'
                  }. Treating as pass.`
                )
                description = `${
                  FACTION_META[faction].label
                } could not place token in #${simulation.action.clearingId.toUpperCase()} - passed instead`
              }
              break
            }
            case 'pass': {
              if (faction === 'eyrie' && enforcedAction) {
                await runEyrieTurmoil(updatedState)
                resolvedByTurmoil = true
              } else {
                description = `${FACTION_META[faction].label} passed: ${simulation.action.reason}`
              }
              break
            }
            default:
              throw new Error('Simulated action is not supported yet')
          }
        }

        if (resolvedByTurmoil) {
          return
        }

        const historyDescription = description || `${FACTION_META[faction].label} completed a simulated action.`

        if (stateChanged) {
          setGameState(updatedState)
          if (faction === 'eyrie' && enforcedAction) {
            setEyrieDecreePlan(prev => {
              if (!prev.steps.length || prev.steps[0] !== simulation.action.type) {
                return prev
              }
              return { ...prev, steps: prev.steps.slice(1) }
            })
            pendingActions?.shift()
            eyriePendingActionsRef.current = pendingActions?.slice() ?? []
          }
        }
        setLastPlayerAction(historyDescription)
        setAiActionHistory(prev => {
          const next: AIActionHistoryEntry[] = [
            ...prev,
            {
              id: `${faction}_${Date.now()}`,
              faction,
              action: historyDescription,
              reasoning: simulation.reasoning,
              timestamp: Date.now(),
            },
          ]
          return next.slice(-20)
        })
      } catch (error) {
        console.error('Simulation error:', error)
        alert(error instanceof Error ? error.message : 'Failed to simulate AI action')
      } finally {
        setIsSimulatingAction(false)
      }
    },
    [
      aiActionHistory,
      gameState,
      isSimulatingAction,
      playerConversation,
      nextEyrieAction,
      runEyrieTurmoil,
      computeEyrieFallbackAction,
    ]
  )

  const schedulePhaseAdvance = useCallback(() => {
    if (autoPlayTimerRef.current) return
    autoPlayTimerRef.current = setTimeout(() => {
      advancePhase()
      autoPlayTimerRef.current = null
    }, 800)
  }, [advancePhase])

  // Game manager - handles automatic turn flow according to Root rules
  const processGameFlow = useCallback(async () => {
    if (!autoPlayEnabled || isSimulatingAction) return

    const currentFaction = gameState.turn.currentFaction
    const currentPhase = gameState.turn.phase

    // Check if we've moved to a new phase/faction, reset action counter
    if (lastTurnRef.current.faction !== currentFaction || lastTurnRef.current.phase !== currentPhase) {
      setActionsThisPhase(0)
      lastTurnRef.current = { faction: currentFaction, phase: currentPhase }
    }

    // AI factions (Eyrie, Woodland Alliance)
    if (isSimulatableFaction(currentFaction)) {
      setWaitingForPlayerAction(false)

      if (currentFaction === 'eyrie') {
        if (currentPhase === 'birdsong') {
          await runEyrieBirdsong()
          setActionsThisPhase(1)
          schedulePhaseAdvance()
          return
        }
        if (currentPhase === 'evening') {
          await runEyrieEvening()
          setActionsThisPhase(1)
          schedulePhaseAdvance()
          return
        }
      }

      const remainingEyrieSteps = eyrieDecreePlan.steps.length
      const eyrieTarget =
        currentFaction === 'eyrie' ? remainingEyrieSteps || buildEyrieDecreeSteps(gameState).length || 0 : 0
      let maxActions = 0
      if (currentFaction === 'eyrie') {
        if (currentPhase === 'daylight') {
          maxActions = Math.max(0, eyrieTarget)
        }
      } else if (currentFaction === 'woodland_alliance') {
        if (currentPhase === 'birdsong') {
          maxActions = 2
        } else if (currentPhase === 'daylight') {
          maxActions = 3
        } else if (currentPhase === 'evening') {
          maxActions = gameState.factions.woodland_alliance.officers
        }
      }

      if (maxActions <= 0) {
        schedulePhaseAdvance()
        return
      }

      if (actionsThisPhase < maxActions) {
        await simulateFactionAction(currentFaction)
        setActionsThisPhase(prev => prev + 1)
      } else {
        schedulePhaseAdvance()
      }
      return
    }

    // Marquise de Cat (player)
    if (currentFaction === 'marquise') {
      if (currentPhase === 'birdsong') {
        // Birdsong: Player can place wood tokens and craft
        setWaitingForPlayerAction(true)
        // Don't auto-advance - let player take actions and manually advance
      } else if (currentPhase === 'daylight') {
        // Daylight: Player can take up to 3 actions (craft + 2 main actions typical in Root)
        // Wait for player input
        setWaitingForPlayerAction(true)

        // Don't auto-advance during daylight - player decides when done
      } else if (currentPhase === 'evening') {
        // Evening: Draw and discard, score - could be player actions or auto
        setWaitingForPlayerAction(true)
        // Don't auto-advance - let player handle evening phase
      }
    }
  }, [
    autoPlayEnabled,
    isSimulatingAction,
    gameState,
    actionsThisPhase,
    simulateFactionAction,
    schedulePhaseAdvance,
    runEyrieBirdsong,
    runEyrieEvening,
  ])

  // Effect to trigger game flow when game state changes or action completes
  useEffect(() => {
    if (autoPlayEnabled && !isSimulatingAction) {
      // Small delay to ensure state has settled
      const timer = setTimeout(() => {
        processGameFlow()
      }, 100)

      return () => clearTimeout(timer)
    }

    return () => {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current)
        autoPlayTimerRef.current = null
      }
    }
  }, [
    gameState.turn.currentFaction,
    gameState.turn.phase,
    autoPlayEnabled,
    isSimulatingAction,
    actionsThisPhase,
    processGameFlow,
  ])

  const allianceBases = Object.entries(gameState.factions.woodland_alliance.bases)
    .filter(([, planted]) => planted)
    .map(([suit]) => suit.replace(/^\w/, c => c.toUpperCase()).replace(/_/g, ' '))
  const allianceBaseLabel = allianceBases.length > 0 ? allianceBases.join(', ') : 'None'
  const allianceSupporters = gameState.factions.woodland_alliance.supporters
  const supporterLabel = `Supporters · M${allianceSupporters.mouse}/R${allianceSupporters.rabbit}/F${allianceSupporters.fox}/B${allianceSupporters.bird}`
  const logistics = [
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
        `Bases · ${allianceBaseLabel}`,
        supporterLabel,
      ],
      victory: gameState.victoryTrack.woodland_alliance,
    },
  ]

  return (
    <ThemeProvider theme={DEFAULT_LIGHT_THEME}>
      <main>
        <Container>
          <TutorChatSection>
            <ChatContainer ref={tutorChatRef}>
              <ChatViewer conversation={tutorConversation} isReplying={loadingTutorResponse} typingAvatar="tutor" />
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
              <HeaderLeft>
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
              </HeaderLeft>
              <HeaderRight>
                <TurnInfoCompact>
                  <TurnInfoLabel>Round {gameState.turn.roundNumber}</TurnInfoLabel>
                  <TurnInfoDivider>•</TurnInfoDivider>
                  <TurnInfoValue color={FACTION_META[gameState.turn.currentFaction].color}>
                    {FACTION_META[gameState.turn.currentFaction].label}
                  </TurnInfoValue>
                  <TurnInfoDivider>•</TurnInfoDivider>
                  <TurnInfoLabel>{formatPhaseLabel(gameState.turn.phase)}</TurnInfoLabel>
                  {gameState.turn.actionSubstep && (
                    <>
                      <TurnInfoDivider>•</TurnInfoDivider>
                      <TurnInfoLabel>{gameState.turn.actionSubstep}</TurnInfoLabel>
                    </>
                  )}
                </TurnInfoCompact>
                <ActionButtonRow>
                  <GameManagerToggle onClick={() => setAutoPlayEnabled(!autoPlayEnabled)} active={autoPlayEnabled}>
                    {autoPlayEnabled ? '⏸ Pause Auto-Play' : '▶ Enable Auto-Play'}
                  </GameManagerToggle>
                  {(!autoPlayEnabled || gameState.turn.currentFaction === 'marquise') && (
                    <>
                      <ActionButton onClick={advancePhase}>Advance phase</ActionButton>
                      {!autoPlayEnabled && <ActionButton onClick={advanceFaction}>Pass turn</ActionButton>}
                    </>
                  )}
                  <ActionButton onClick={resetGameState}>Reset</ActionButton>
                </ActionButtonRow>
              </HeaderRight>
            </ScenarioHeader>
            <GameBoardWrapper>
              <GameBoard
                definition={WOODLAND_BOARD_DEFINITION}
                state={gameState}
                selectableClearings={
                  isPlaceWoodMode
                    ? validPlaceWoodClearings
                    : isMarchMode
                    ? [...validFromClearings, ...validToClearings]
                    : isBattleMode
                    ? validBattleClearings
                    : buildMode
                    ? validBuildClearings
                    : isRecruitMode
                    ? validRecruitClearings
                    : []
                }
                selectedClearing={
                  placeWoodClearing ||
                  marchFromClearing ||
                  marchToClearing ||
                  battleClearing ||
                  buildClearing ||
                  undefined
                }
                onClearingClick={
                  isPlaceWoodMode
                    ? handlePlaceWoodClearingClick
                    : isMarchMode
                    ? handleClearingClick
                    : isBattleMode
                    ? handleBattleClearingClick
                    : buildMode
                    ? handleBuildClearingClick
                    : undefined
                }
              />
            </GameBoardWrapper>
            <HudGrid>
              <HudPanel>
                <HudTitle>
                  <Image
                    src={`/image/${
                      gameState.turn.currentFaction === 'marquise'
                        ? 'cat'
                        : gameState.turn.currentFaction === 'eyrie'
                        ? 'eyrie'
                        : 'alliance'
                    }.png`}
                    alt={FACTION_META[gameState.turn.currentFaction].label}
                    width={24}
                    height={24}
                  />
                  <span style={{ color: FACTION_META[gameState.turn.currentFaction].color, fontWeight: 700 }}>
                    {FACTION_META[gameState.turn.currentFaction].label} Actions
                  </span>
                </HudTitle>
                <ActionsLayout>
                  <ActionControlsColumn>
                    {/* Marquise de Cat Actions */}
                    {gameState.turn.currentFaction === 'marquise' && gameState.turn.phase === 'birdsong' && (
                      <ActionSection>
                        <PhaseLabel>
                          Birdsong Phase {actionsThisPhase > 0 ? `(${actionsThisPhase}/1 action taken)` : ''}
                        </PhaseLabel>
                        {waitingForPlayerAction && autoPlayEnabled && (
                          <PlayerTurnIndicator>
                            ⏳ Your turn! Take actions, then click "Advance phase" when done.
                          </PlayerTurnIndicator>
                        )}
                        {actionsThisPhase >= 1 && (
                          <PlayerTurnIndicator>
                            Maximum actions reached! Click "Advance phase" to continue.
                          </PlayerTurnIndicator>
                        )}
                        <ActionGrid>
                          <ActionButton onClick={togglePlaceWood} disabled={!canPlayerTakeAction() && !isPlaceWoodMode}>
                            {isPlaceWoodMode ? 'Cancel Place Wood' : 'Place Wood'}
                          </ActionButton>
                          <ActionButton onClick={handleNotImplemented} disabled={!canPlayerTakeAction()}>
                            Craft Card
                          </ActionButton>
                        </ActionGrid>
                      </ActionSection>
                    )}
                    {gameState.turn.currentFaction === 'marquise' && gameState.turn.phase === 'daylight' && (
                      <ActionSection>
                        <PhaseLabel>
                          Daylight Phase {actionsThisPhase > 0 ? `(${actionsThisPhase}/3 actions taken)` : ''}
                        </PhaseLabel>
                        {waitingForPlayerAction && autoPlayEnabled && (
                          <PlayerTurnIndicator>
                            ⏳ Your turn! Take actions, then click "Advance phase" when done.
                          </PlayerTurnIndicator>
                        )}
                        {actionsThisPhase >= 3 && (
                          <PlayerTurnIndicator>
                            Maximum actions reached! Click "Advance phase" to continue.
                          </PlayerTurnIndicator>
                        )}
                        <ActionGrid>
                          <ActionButton onClick={toggleBattle} disabled={!canPlayerTakeAction() && !isBattleMode}>
                            {isBattleMode ? 'Cancel Battle' : 'Battle'}
                          </ActionButton>
                          <ActionButton onClick={toggleMarch} disabled={!canPlayerTakeAction() && !isMarchMode}>
                            {isMarchMode ? 'Cancel March' : 'March'}
                          </ActionButton>
                          <ActionButton onClick={toggleRecruit} disabled={!canPlayerTakeAction() && !isRecruitMode}>
                            {isRecruitMode ? 'Cancel Recruit' : 'Recruit'}
                          </ActionButton>
                          <ActionButton
                            onClick={toggleBuildSawmill}
                            disabled={!canPlayerTakeAction() && buildMode !== 'sawmill'}
                          >
                            {buildMode === 'sawmill' ? 'Cancel Build' : 'Build Sawmill'}
                          </ActionButton>
                          <ActionButton
                            onClick={toggleBuildWorkshop}
                            disabled={!canPlayerTakeAction() && buildMode !== 'workshop'}
                          >
                            {buildMode === 'workshop' ? 'Cancel Build' : 'Build Workshop'}
                          </ActionButton>
                          <ActionButton
                            onClick={toggleBuildRecruiter}
                            disabled={!canPlayerTakeAction() && buildMode !== 'recruiter'}
                          >
                            {buildMode === 'recruiter' ? 'Cancel Build' : 'Build Recruiter'}
                          </ActionButton>
                        </ActionGrid>
                      </ActionSection>
                    )}
                    {gameState.turn.currentFaction === 'marquise' && gameState.turn.phase === 'evening' && (
                      <ActionSection>
                        <PhaseLabel>
                          Evening Phase {actionsThisPhase > 0 ? `(${actionsThisPhase}/1 action taken)` : ''}
                        </PhaseLabel>
                        {waitingForPlayerAction && autoPlayEnabled && (
                          <PlayerTurnIndicator>
                            ⏳ Your turn! Take actions, then click "Advance phase" when done.
                          </PlayerTurnIndicator>
                        )}
                        {actionsThisPhase >= 1 && (
                          <PlayerTurnIndicator>
                            Maximum actions reached! Click "Advance phase" to continue.
                          </PlayerTurnIndicator>
                        )}
                        <ActionGrid>
                          <ActionButton onClick={handleNotImplemented} disabled={!canPlayerTakeAction()}>
                            Draw & Discard
                          </ActionButton>
                        </ActionGrid>
                      </ActionSection>
                    )}

                    {/* Eyrie Dynasties Actions */}
                    {gameState.turn.currentFaction === 'eyrie' && (
                      <ActionSection>
                        <PhaseLabel>{formatPhaseLabel(gameState.turn.phase)} Phase</PhaseLabel>
                        <AIFactionMessage>
                          {gameState.turn.phase === 'daylight'
                            ? 'Resolve the Decree one action at a time.'
                            : 'Handle mandatory Birdsong/Evening steps before moving on.'}
                        </AIFactionMessage>
                        <ActionGrid>
                          {gameState.turn.phase === 'birdsong' && (
                            <ActionButton
                              onClick={handleEyrieBirdsong}
                              disabled={isSimulatingAction || actionsThisPhase > 0}
                            >
                              {isSimulatingAction ? 'Resolving...' : 'Resolve Birdsong'}
                            </ActionButton>
                          )}
                          {gameState.turn.phase === 'daylight' && (
                            <ActionButton onClick={() => simulateFactionAction('eyrie')} disabled={isSimulatingAction}>
                              {isSimulatingAction ? 'Simulating...' : 'Simulate Decree Action'}
                            </ActionButton>
                          )}
                          {gameState.turn.phase === 'evening' && (
                            <ActionButton onClick={handleEyrieEvening} disabled={isSimulatingAction}>
                              {isSimulatingAction ? 'Resolving...' : 'Resolve Evening'}
                            </ActionButton>
                          )}
                        </ActionGrid>
                      </ActionSection>
                    )}

                    {/* Woodland Alliance Actions */}
                    {gameState.turn.currentFaction === 'woodland_alliance' && (
                      <ActionSection>
                        <PhaseLabel>{formatPhaseLabel(gameState.turn.phase)} Phase</PhaseLabel>
                        <AIFactionMessage>
                          AI-controlled faction. Click "Simulate Turn" to let the AI take an action.
                        </AIFactionMessage>
                        <ActionGrid>
                          <ActionButton
                            onClick={() => simulateFactionAction('woodland_alliance')}
                            disabled={isSimulatingAction}
                          >
                            {isSimulatingAction ? 'Simulating...' : 'Simulate Action'}
                          </ActionButton>
                        </ActionGrid>
                      </ActionSection>
                    )}
                    {/* Action detail panels for Marquise */}
                    {isPlaceWoodMode && (
                      <MarchPanel>
                        <MarchTitle>Place Wood</MarchTitle>
                        {!placeWoodClearing && (
                          <>
                            <MarchInstruction>Select a clearing with at least one Marquise sawmill</MarchInstruction>
                            <MarchInstruction>
                              Wood in supply: <strong>{gameState.factions.marquise.woodInSupply}</strong>
                            </MarchInstruction>
                          </>
                        )}
                        {placeWoodClearing && (
                          <>
                            <MarchInstruction>
                              Place wood in <strong>#{placeWoodClearing.toUpperCase()}</strong>
                            </MarchInstruction>
                            <MarchInstruction>
                              Sawmills in clearing:{' '}
                              <strong>
                                {(() => {
                                  const clearing = gameState.board.clearings[placeWoodClearing]
                                  return clearing?.buildings.filter(
                                    b => b.faction === 'marquise' && b.type === 'sawmill'
                                  ).length
                                })()}
                              </strong>
                            </MarchInstruction>
                            <MarchInstruction>
                              Existing wood tokens:{' '}
                              <strong>
                                {(() => {
                                  const clearing = gameState.board.clearings[placeWoodClearing]
                                  return clearing?.tokens.filter(t => t.faction === 'marquise' && t.type === 'wood')
                                    .length
                                })()}
                              </strong>
                            </MarchInstruction>
                            <MarchButtonRow>
                              <ActionButton onClick={executePlaceWood}>Place Wood</ActionButton>
                              <ActionButton onClick={cancelPlaceWood}>Cancel</ActionButton>
                            </MarchButtonRow>
                          </>
                        )}
                        {!placeWoodClearing && (
                          <MarchButtonRow>
                            <ActionButton onClick={cancelPlaceWood}>Cancel</ActionButton>
                          </MarchButtonRow>
                        )}
                      </MarchPanel>
                    )}
                    {isMarchMode && (
                      <MarchPanel>
                        <MarchTitle>March Action</MarchTitle>
                        {!marchFromClearing && (
                          <MarchInstruction>Select a clearing with Marquise warriors to start a move.</MarchInstruction>
                        )}
                        {marchFromClearing && !marchToClearing && (
                          <MarchInstruction>
                            From: <strong>#{marchFromClearing.toUpperCase()}</strong> → Select adjacent destination.
                          </MarchInstruction>
                        )}
                        {marchFromClearing && marchToClearing && (
                          <>
                            <MarchInstruction>
                              From: <strong>#{marchFromClearing.toUpperCase()}</strong> → To:{' '}
                              <strong>#{marchToClearing.toUpperCase()}</strong>
                            </MarchInstruction>
                            <WarriorSelector>
                              <label>Warriors to move:</label>
                              <input
                                type="range"
                                min="1"
                                max={Math.max(1, maxWarriors)}
                                value={Math.min(marchWarriorCount, Math.max(1, maxWarriors))}
                                onChange={e => setMarchWarriorCount(Number(e.target.value))}
                              />
                              <WarriorCount>
                                {Math.min(marchWarriorCount, Math.max(1, maxWarriors))} / {Math.max(1, maxWarriors)}
                              </WarriorCount>
                            </WarriorSelector>
                          </>
                        )}
                        <MarchButtonRow>
                          <ActionButton onClick={executeMarch} disabled={!canExecuteMarchAction}>
                            Execute Move
                          </ActionButton>
                          <ActionButton
                            onClick={() => {
                              setMarchFromClearing(null)
                              setMarchToClearing(null)
                              setMarchWarriorCount(1)
                            }}
                          >
                            Clear Selection
                          </ActionButton>
                          <ActionButton onClick={cancelMarch}>Exit March</ActionButton>
                        </MarchButtonRow>
                      </MarchPanel>
                    )}
                    {isBattleMode && (
                      <MarchPanel>
                        <MarchTitle>Battle Action</MarchTitle>
                        {!battleClearing && (
                          <MarchInstruction>Select a clearing with enemies to battle</MarchInstruction>
                        )}
                        {battleClearing && !battleDefender && (
                          <>
                            <MarchInstruction>
                              Clearing: <strong>#{battleClearing.toUpperCase()}</strong> → Select defender
                            </MarchInstruction>
                            <DefenderSelector>
                              {availableDefenders.map(faction => (
                                <DefenderButton
                                  key={faction}
                                  onClick={() => setBattleDefender(faction)}
                                  selected={battleDefender === faction}
                                >
                                  {FACTION_META[faction].label}
                                </DefenderButton>
                              ))}
                            </DefenderSelector>
                          </>
                        )}
                        {battleClearing && battleDefender && (
                          <>
                            <MarchInstruction>
                              Battle in <strong>#{battleClearing.toUpperCase()}</strong>
                              <br />
                              Attacker: <strong>Marquise de Cat</strong>
                              <br />
                              Defender: <strong>{FACTION_META[battleDefender].label}</strong>
                            </MarchInstruction>
                            <MarchButtonRow>
                              <ActionButton onClick={executeBattle}>Execute Battle</ActionButton>
                              <ActionButton onClick={cancelBattle}>Cancel</ActionButton>
                            </MarchButtonRow>
                          </>
                        )}
                        {battleClearing && !battleDefender && (
                          <MarchButtonRow>
                            <ActionButton onClick={cancelBattle}>Cancel</ActionButton>
                          </MarchButtonRow>
                        )}
                      </MarchPanel>
                    )}
                    {buildMode && (
                      <MarchPanel>
                        <MarchTitle>Build {buildMode.charAt(0).toUpperCase() + buildMode.slice(1)}</MarchTitle>
                        {!buildClearing && (
                          <>
                            <MarchInstruction>
                              Select a clearing with Marquise warriors and available building slots
                            </MarchInstruction>
                            <MarchInstruction>
                              Wood cost:{' '}
                              <strong>
                                {(() => {
                                  const track = gameState.factions.marquise.buildingTracks[buildMode]
                                  const trackDef = MARQUISE_BUILDING_TRACKS[buildMode]
                                  if (track.builtCount >= trackDef.steps.length) return 'MAX'
                                  return trackDef.steps[track.builtCount].costWood
                                })()}
                              </strong>
                              {' · '}
                              Wood available: <strong>{gameState.factions.marquise.woodInSupply}</strong>
                            </MarchInstruction>
                            <MarchInstruction>
                              Buildings built:{' '}
                              <strong>{gameState.factions.marquise.buildingTracks[buildMode].builtCount} / 6</strong>
                            </MarchInstruction>
                          </>
                        )}
                        {buildClearing && (
                          <>
                            <MarchInstruction>
                              Build {buildMode} in <strong>#{buildClearing.toUpperCase()}</strong>
                            </MarchInstruction>
                            <MarchButtonRow>
                              <ActionButton onClick={executeBuild}>Execute Build</ActionButton>
                              <ActionButton onClick={cancelBuild}>Cancel</ActionButton>
                            </MarchButtonRow>
                          </>
                        )}
                        {!buildClearing && (
                          <MarchButtonRow>
                            <ActionButton onClick={cancelBuild}>Cancel</ActionButton>
                          </MarchButtonRow>
                        )}
                      </MarchPanel>
                    )}
                    {isRecruitMode && (
                      <MarchPanel>
                        <MarchTitle>Recruit Warriors</MarchTitle>
                        <MarchInstruction>
                          Each recruiter places one warrior. Warriors in supply:{' '}
                          <strong>{gameState.factions.marquise.warriorsInSupply}</strong>
                        </MarchInstruction>
                        {recruitTargets.length === 0 && (
                          <>
                            <MarchInstruction>No recruiters are on the map. Build a recruiter first.</MarchInstruction>
                            <MarchButtonRow>
                              <ActionButton onClick={cancelRecruit}>Close</ActionButton>
                            </MarchButtonRow>
                          </>
                        )}
                        {recruitTargets.length > 0 && (
                          <>
                            <MarchInstruction>
                              Potential recruits this action: <strong>{totalPotentialRecruit}</strong>
                            </MarchInstruction>
                            {recruitPreview.map(target => (
                              <MarchInstruction key={target.clearingId}>
                                #{target.clearingId.toUpperCase()} · Recruiters {target.recruiters} → Will place{' '}
                                {target.willPlace}
                              </MarchInstruction>
                            ))}
                            <MarchButtonRow>
                              <ActionButton onClick={executeRecruit} disabled={!canExecuteRecruit}>
                                Recruit Everywhere
                              </ActionButton>
                              <ActionButton onClick={cancelRecruit}>Cancel</ActionButton>
                            </MarchButtonRow>
                          </>
                        )}
                      </MarchPanel>
                    )}
                  </ActionControlsColumn>
                </ActionsLayout>
              </HudPanel>
              <HudPanel>
                <HudTitle>Action History</HudTitle>
                <ActionHistoryList>
                  {aiActionHistory.length === 0 ? (
                    <ActionHistoryEmpty>No actions have been taken yet.</ActionHistoryEmpty>
                  ) : (
                    aiActionHistory
                      .slice()
                      .reverse()
                      .slice(0, 10)
                      .map(entry => (
                        <ActionHistoryItem key={entry.id}>
                          <ActionHistoryHeader>
                            <ActionHistoryFaction faction={entry.faction}>
                              {FACTION_META[entry.faction].label}
                            </ActionHistoryFaction>
                            <ActionHistoryTimestamp>
                              {new Date(entry.timestamp).toLocaleTimeString()}
                            </ActionHistoryTimestamp>
                          </ActionHistoryHeader>
                          <ActionHistoryAction>{entry.action}</ActionHistoryAction>
                          {entry.reasoning && <ActionHistoryReasoning>💭 {entry.reasoning}</ActionHistoryReasoning>}
                        </ActionHistoryItem>
                      ))
                  )}
                </ActionHistoryList>
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

const HeaderLeft = styled.div`
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: flex-start;
  flex: 1;
  min-width: 0;
`

const HeaderRight = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-end;
`

const TurnInfoCompact = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.95);
  border: 2px solid #d9c19a;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  white-space: nowrap;
`

const TurnInfoLabel = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: #3d2a18;
`

const TurnInfoValue = styled.span<{ color: string }>`
  font-size: 14px;
  font-weight: 700;
  color: ${({ color }) => color};
`

const TurnInfoDivider = styled.span`
  color: #d9c19a;
  font-weight: 700;
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
  display: flex;
  align-items: center;
  gap: 8px;
`

const TurnMeta = styled.div`
  display: grid;
  gap: 6px;
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
  gap: 6px;
  flex-wrap: wrap;
`

const ActionButton = styled.button`
  border: none;
  border-radius: 999px;
  background: #3d2a18;
  color: white;
  padding: 5px 12px;
  min-height: 28px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  font-size: 10px;
  cursor: pointer;
  transition: opacity 120ms ease, transform 120ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;

  :hover {
    opacity: 0.9;
  }

  :active {
    transform: translateY(1px);
  }
`

const GameManagerToggle = styled.button<{ active: boolean }>`
  border: none;
  border-radius: 999px;
  background: ${({ active }) => (active ? '#27ae60' : '#d96a3d')};
  color: white;
  padding: 5px 14px;
  min-height: 28px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  font-size: 10px;
  cursor: pointer;
  transition: all 120ms ease;
  display: flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  gap: 4px;

  :hover {
    opacity: 0.9;
    transform: translateY(-1px);
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

const ActionHistoryList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 400px;
  overflow-y: auto;
  padding-right: 4px;

  /* Custom scrollbar */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.05);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(61, 42, 24, 0.3);
    border-radius: 3px;

    &:hover {
      background: rgba(61, 42, 24, 0.5);
    }
  }
`

const ActionHistoryItem = styled.div`
  background: rgba(0, 0, 0, 0.04);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const ActionHistoryHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
`

const ActionHistoryFaction = styled.div<{ faction: FactionId }>`
  font-weight: 700;
  font-size: 13px;
  color: ${({ faction }) => FACTION_META[faction].color};
  flex: 1;
`

const ActionHistoryAction = styled.div`
  font-size: 13px;
  line-height: 1.5;
  color: #2a170c;
  font-weight: 500;
`

const ActionHistoryReasoning = styled.div`
  font-size: 12px;
  color: #6a5340;
  line-height: 1.4;
  font-style: italic;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.5);
  border-radius: 6px;
  border-left: 3px solid rgba(106, 83, 64, 0.3);
`

const ActionHistoryTimestamp = styled.div`
  font-size: 10px;
  color: #9aa5b1;
  white-space: nowrap;
  font-weight: 500;
`

const ActionHistoryEmpty = styled.div`
  text-align: center;
  color: #9aa5b1;
  padding: 32px 16px;
  font-size: 13px;
  font-style: italic;
  line-height: 1.5;
`

const ActionSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const ActionsLayout = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const ActionControlsColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const PhaseLabel = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: gray;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 2px;
`

const ActionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 6px;
`

const DisabledMessage = styled.div`
  font-size: 13px;
  color: #6a5340;
  text-align: center;
  padding: 16px;
  font-style: italic;
`

const MarchPanel = styled.div`
  background: rgba(217, 106, 61, 0.1);
  border: 2px solid #d96a3d;
  border-radius: 12px;
  padding: 12px;
  margin-top: 8px;
`

const MarchTitle = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: #d96a3d;
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`

const MarchInstruction = styled.div`
  font-size: 13px;
  color: #3d2a18;
  margin-bottom: 10px;

  strong {
    color: #d96a3d;
    font-weight: 700;
  }
`

const WarriorSelector = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;

  label {
    font-size: 12px;
    color: #3d2a18;
    font-weight: 600;
  }

  input[type='range'] {
    width: 100%;
    accent-color: #d96a3d;
  }
`

const WarriorCount = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: #d96a3d;
  text-align: center;
`

const MarchButtonRow = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`

const DefenderSelector = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
`

const DefenderButton = styled.button<{ selected: boolean }>`
  border: 2px solid ${({ selected }) => (selected ? '#d96a3d' : '#d0b084')};
  border-radius: 8px;
  background: ${({ selected }) => (selected ? 'rgba(217, 106, 61, 0.2)' : 'rgba(255, 255, 255, 0.9)')};
  color: #3d2a18;
  padding: 10px 14px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;

  :hover {
    border-color: #d96a3d;
    background: rgba(217, 106, 61, 0.15);
  }

  :active {
    transform: translateY(1px);
  }
`

const AIFactionMessage = styled.div`
  font-size: 13px;
  color: #5a4632;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  font-style: italic;
  text-align: center;
  line-height: 1.5;
`

const PlayerTurnIndicator = styled.div`
  font-size: 13px;
  color: #2a170c;
  background: linear-gradient(135deg, rgba(39, 174, 96, 0.15), rgba(39, 174, 96, 0.05));
  border: 2px solid #27ae60;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 12px;
  font-weight: 600;
  text-align: center;
  line-height: 1.5;
  animation: pulse-glow 2s ease-in-out infinite;

  @keyframes pulse-glow {
    0%,
    100% {
      box-shadow: 0 0 0 rgba(39, 174, 96, 0.4);
    }
    50% {
      box-shadow: 0 0 15px rgba(39, 174, 96, 0.6);
    }
  }
`

export default function Home() {
  return (
    <Suspense fallback={null}>
      <LearnPageContent />
    </Suspense>
  )
}
