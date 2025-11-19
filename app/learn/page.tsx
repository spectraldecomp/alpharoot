'use client'
import { ChatInput } from '@/components/chatInput'
import { ChatViewer } from '@/components/chatViewer'
import { GameBoard } from '@/components/gameBoard'
import { SCENARIOS } from '@/constants/scenarios'
import { WOODLAND_BOARD_DEFINITION } from '@/gameState/boardDefinition'
import { summarizeGameState } from '@/gameState/actions'
import { getNextFaction, getNextPhase, getScenarioGameState } from '@/gameState/scenarioState'
import { DecreeColumn, FactionId, GameState, MARQUISE_BUILDING_TRACKS } from '@/gameState/schema'
import { useMultiPartyChat } from '@/hooks/useMultiPartyChat_realtime'
import { TUTOR_SYSTEM_PROMPT } from '@/prompts/tutor'
import { useChatCompleteMutation } from '@/redux/api/common'
import { ThemeProvider, css } from '@emotion/react'
import styled from '@emotion/styled'
import { DEFAULT_LIGHT_THEME } from '@wookiejin/react-component'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChatCompletionParams } from '../api/chatComplete/route'

export type MultiPartyChat = (ChatCompletionParams['conversation'][number] & {
  faction?: 'cat' | 'alliance' | 'eyrie'
})[]

const DIFFICULTY_LABELS = ['Easy', 'Medium', 'Hard'] as const

const FACTION_META: Record<FactionId, { label: string; color: string }> = {
  marquise: { label: 'Marquise de Cat', color: '#d96a3d' },
  eyrie: { label: 'Eyrie Dynasties', color: '#4a90e2' },
  woodland_alliance: { label: 'Woodland Alliance', color: '#27ae60' },
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
  const [recruitClearing, setRecruitClearing] = useState<string | null>(null)
  const [recruitWarriorCount, setRecruitWarriorCount] = useState(1)

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
      setRecruitClearing(null)
      setRecruitWarriorCount(1)
    }
  }, [isMarchMode])

  const cancelMarch = useCallback(() => {
    setIsMarchMode(false)
    setMarchFromClearing(null)
    setMarchToClearing(null)
    setMarchWarriorCount(1)
  }, [])

  const handleClearingClick = useCallback((clearingId: string) => {
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
  }, [isMarchMode, marchFromClearing, marchToClearing])

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
        const error = await response.json()
        alert(error.error || 'Failed to execute march')
        return
      }

      const data = await response.json()
      setGameState(data.state)
      cancelMarch()
    } catch (error) {
      console.error('March error:', error)
      alert('Failed to execute march')
    }
  }, [marchFromClearing, marchToClearing, marchWarriorCount, gameState, cancelMarch])

  // Get valid clearings for march selection
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
      setRecruitClearing(null)
      setRecruitWarriorCount(1)
    }
  }, [isBattleMode])

  const cancelBattle = useCallback(() => {
    setIsBattleMode(false)
    setBattleClearing(null)
    setBattleDefender(null)
  }, [])

  const handleBattleClearingClick = useCallback((clearingId: string) => {
    if (!isBattleMode) return
    setBattleClearing(clearingId)
    setBattleDefender(null)
  }, [isBattleMode])

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
      
      cancelBattle()
    } catch (error) {
      console.error('Battle error:', error)
      alert('Failed to execute battle')
    }
  }, [battleClearing, battleDefender, gameState, cancelBattle])

  // Get valid clearings for battle selection
  const validBattleClearings = useMemo(() => {
    if (!isBattleMode || battleClearing) return []
    
    return Object.entries(gameState.board.clearings)
      .filter(([, clearing]) => {
        const marquiseWarriors = clearing.warriors.marquise ?? 0
        // Check if there are any enemy pieces (warriors, buildings, or tokens)
        const hasEnemyPieces = Object.entries(clearing.warriors)
          .some(([faction]) => faction !== 'marquise') ||
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
      setRecruitClearing(null)
      setRecruitWarriorCount(1)
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
      setRecruitClearing(null)
      setRecruitWarriorCount(1)
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
      setRecruitClearing(null)
      setRecruitWarriorCount(1)
    }
  }, [buildMode])

  const cancelBuild = useCallback(() => {
    setBuildMode(null)
    setBuildClearing(null)
  }, [])

  const handleBuildClearingClick = useCallback((clearingId: string) => {
    if (!buildMode) return
    setBuildClearing(clearingId)
  }, [buildMode])

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
      
      cancelBuild()
    } catch (error) {
      console.error('Build error:', error)
      alert('Failed to build')
    }
  }, [buildMode, buildClearing, gameState, cancelBuild])

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
      setRecruitClearing(null)
      setRecruitWarriorCount(1)
    } else {
      // Turn on recruit mode, turn off other modes
      setIsRecruitMode(true)
      setRecruitClearing(null)
      setRecruitWarriorCount(1)
      setIsMarchMode(false)
      setMarchFromClearing(null)
      setMarchToClearing(null)
      setMarchWarriorCount(1)
      setIsBattleMode(false)
      setBattleClearing(null)
      setBattleDefender(null)
      setBuildMode(null)
      setBuildClearing(null)
    }
  }, [isRecruitMode])

  const cancelRecruit = useCallback(() => {
    setIsRecruitMode(false)
    setRecruitClearing(null)
    setRecruitWarriorCount(1)
  }, [])

  const handleRecruitClearingClick = useCallback((clearingId: string) => {
    if (!isRecruitMode) return
    setRecruitClearing(clearingId)
    setRecruitWarriorCount(1)
  }, [isRecruitMode])

  const executeRecruit = useCallback(async () => {
    if (!recruitClearing) return

    try {
      const response = await fetch('/api/game/recruit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: gameState,
          faction: 'marquise',
          clearingId: recruitClearing,
          warriors: recruitWarriorCount,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        alert(error.error || 'Failed to recruit')
        return
      }

      const data = await response.json()
      setGameState(data.state)
      
      alert(
        `⚔️ Successfully recruited ${recruitWarriorCount} warrior(s) in clearing #${recruitClearing.toUpperCase()}\n\n` +
        `Warriors in supply: ${data.state.factions.marquise.warriorsInSupply}`
      )
      
      cancelRecruit()
    } catch (error) {
      console.error('Recruit error:', error)
      alert('Failed to recruit')
    }
  }, [recruitClearing, recruitWarriorCount, gameState, cancelRecruit])

  // Get valid clearings for recruiting
  const validRecruitClearings = useMemo(() => {
    if (!isRecruitMode || recruitClearing) return []
    
    return Object.entries(gameState.board.clearings)
      .filter(([, clearing]) => {
        // Must have recruiters in the clearing
        const recruitersInClearing = clearing.buildings.filter(
          b => b.faction === 'marquise' && b.type === 'recruiter'
        ).length
        return recruitersInClearing > 0
      })
      .map(([id]) => id)
  }, [isRecruitMode, recruitClearing, gameState.board.clearings])

  // Get max warriors that can be recruited in selected clearing
  const maxRecruitWarriors = useMemo(() => {
    if (!recruitClearing) return 0
    
    const clearing = gameState.board.clearings[recruitClearing]
    if (!clearing) return 0
    
    const recruitersInClearing = clearing.buildings.filter(
      b => b.faction === 'marquise' && b.type === 'recruiter'
    ).length
    
    // Can recruit up to the number of recruiters, but limited by supply
    return Math.min(recruitersInClearing, gameState.factions.marquise.warriorsInSupply)
  }, [recruitClearing, gameState.board.clearings, gameState.factions.marquise.warriorsInSupply])

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
              <GameBoard
                definition={WOODLAND_BOARD_DEFINITION}
                state={gameState}
                selectableClearings={
                  isMarchMode 
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
                  marchFromClearing || marchToClearing || battleClearing || buildClearing || recruitClearing || undefined
                }
                onClearingClick={
                  isMarchMode 
                    ? handleClearingClick 
                    : isBattleMode 
                    ? handleBattleClearingClick 
                    : buildMode
                    ? handleBuildClearingClick
                    : isRecruitMode
                    ? handleRecruitClearingClick
                    : () => {}
                }
              />
            </GameBoardWrapper>
            <HudGrid>
              <HudPanel>
                <HudTitle>
                  <Image src="/image/cat.png" alt="Marquise de Cat" width={24} height={24} />Actions
                </HudTitle>
                {gameState.turn.currentFaction === 'marquise' && gameState.turn.phase === 'birdsong' && (
                  <ActionSection>
                    <PhaseLabel>Birdsong</PhaseLabel>
                    <ActionGrid>
                      <ActionButton disabled>Place Wood</ActionButton>
                      <ActionButton disabled>Craft Card</ActionButton>
                    </ActionGrid>
                  </ActionSection>
                )}
                {gameState.turn.currentFaction === 'marquise' && gameState.turn.phase === 'daylight' && (
                  <ActionSection>
                    <PhaseLabel>Daylight</PhaseLabel>
                    <ActionGrid>
                      <ActionButton onClick={toggleBattle}>
                        {isBattleMode ? 'Cancel Battle' : 'Battle'}
                      </ActionButton>
                      <ActionButton onClick={toggleMarch}>
                        {isMarchMode ? 'Cancel March' : 'March'}
                      </ActionButton>
                      <ActionButton onClick={toggleRecruit}>
                        {isRecruitMode ? 'Cancel Recruit' : 'Recruit'}
                      </ActionButton>
                      <ActionButton onClick={toggleBuildSawmill}>
                        {buildMode === 'sawmill' ? 'Cancel Build' : 'Build Sawmill'}
                      </ActionButton>
                      <ActionButton onClick={toggleBuildWorkshop}>
                        {buildMode === 'workshop' ? 'Cancel Build' : 'Build Workshop'}
                      </ActionButton>
                      <ActionButton onClick={toggleBuildRecruiter}>
                        {buildMode === 'recruiter' ? 'Cancel Build' : 'Build Recruiter'}
                      </ActionButton>
                      {/* <ActionButton disabled>Overwork</ActionButton> */}
                    </ActionGrid>
                  </ActionSection>
                )}
                {gameState.turn.currentFaction === 'marquise' && gameState.turn.phase === 'evening' && (
                  <ActionSection>
                    <PhaseLabel>Evening</PhaseLabel>
                    <ActionGrid>
                      <ActionButton disabled>Draw & Discard</ActionButton>
                      <ActionButton disabled>Score Points</ActionButton>
                    </ActionGrid>
                  </ActionSection>
                )}
                {isMarchMode && (
                  <MarchPanel>
                    <MarchTitle>March Action</MarchTitle>
                    {!marchFromClearing && (
                      <MarchInstruction>Select a clearing with Marquise warriors</MarchInstruction>
                    )}
                    {marchFromClearing && !marchToClearing && (
                      <MarchInstruction>
                        From: <strong>#{marchFromClearing.toUpperCase()}</strong> → Select adjacent destination
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
                            max={maxWarriors}
                            value={marchWarriorCount}
                            onChange={e => setMarchWarriorCount(Number(e.target.value))}
                          />
                          <WarriorCount>
                            {marchWarriorCount} / {maxWarriors}
                          </WarriorCount>
                        </WarriorSelector>
                        <MarchButtonRow>
                          <ActionButton onClick={executeMarch}>Execute March</ActionButton>
                          <ActionButton onClick={cancelMarch}>Cancel</ActionButton>
                        </MarchButtonRow>
                      </>
                    )}
                    {marchFromClearing && !marchToClearing && (
                      <MarchButtonRow>
                        <ActionButton onClick={cancelMarch}>Cancel</ActionButton>
                      </MarchButtonRow>
                    )}
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
                          Wood cost: <strong>{(() => {
                            const track = gameState.factions.marquise.buildingTracks[buildMode]
                            const trackDef = MARQUISE_BUILDING_TRACKS[buildMode]
                            if (track.builtCount >= trackDef.steps.length) return 'MAX'
                            return trackDef.steps[track.builtCount].costWood
                          })()}</strong>
                          {' · '}
                          Wood available: <strong>{gameState.factions.marquise.woodInSupply}</strong>
                        </MarchInstruction>
                        <MarchInstruction>
                          Buildings built: <strong>{gameState.factions.marquise.buildingTracks[buildMode].builtCount} / 6</strong>
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
                    {!recruitClearing && (
                      <>
                        <MarchInstruction>
                          Select a clearing with Marquise recruiters
                        </MarchInstruction>
                        <MarchInstruction>
                          Warriors in supply: <strong>{gameState.factions.marquise.warriorsInSupply}</strong>
                        </MarchInstruction>
                      </>
                    )}
                    {recruitClearing && (
                      <>
                        <MarchInstruction>
                          Recruit in <strong>#{recruitClearing.toUpperCase()}</strong>
                        </MarchInstruction>
                        <MarchInstruction>
                          Recruiters in clearing: <strong>{(() => {
                            const clearing = gameState.board.clearings[recruitClearing]
                            return clearing.buildings.filter(
                              b => b.faction === 'marquise' && b.type === 'recruiter'
                            ).length
                          })()}</strong>
                        </MarchInstruction>
                        <WarriorSelector>
                          <label>Warriors to recruit:</label>
                          <input
                            type="range"
                            min="1"
                            max={maxRecruitWarriors}
                            value={recruitWarriorCount}
                            onChange={e => setRecruitWarriorCount(Number(e.target.value))}
                          />
                          <WarriorCount>
                            {recruitWarriorCount} / {maxRecruitWarriors}
                          </WarriorCount>
                        </WarriorSelector>
                        <MarchButtonRow>
                          <ActionButton onClick={executeRecruit}>Execute Recruit</ActionButton>
                          <ActionButton onClick={cancelRecruit}>Cancel</ActionButton>
                        </MarchButtonRow>
                      </>
                    )}
                    {!recruitClearing && (
                      <MarchButtonRow>
                        <ActionButton onClick={cancelRecruit}>Cancel</ActionButton>
                      </MarchButtonRow>
                    )}
                  </MarchPanel>
                )}
                {gameState.turn.currentFaction !== 'marquise' && (
                  <ActionSection>
                    <DisabledMessage>Wait for Marquise de Cat's turn</DisabledMessage>
                  </ActionSection>
                )}
              </HudPanel>
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
  display: flex;
  align-items: center;
  gap: 8px;
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
  min-height: 32px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  font-size: 11px;
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

const ActionSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const PhaseLabel = styled.div`
  font-size: 14px;
  font-weight: 700;
  color: #d96a3d;
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
  
  input[type="range"] {
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
