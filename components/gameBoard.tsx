import { BOARD_DIMENSIONS } from '@/gameState/boardDefinition'
import {
  BoardDefinition,
  BuildingInstance,
  BuildingType,
  FactionId,
  GameState,
  Suit,
  TokenType,
} from '@/gameState/schema'
import { css } from '@emotion/react'
import styled from '@emotion/styled'
import { useEffect, useMemo, useRef, useState } from 'react'

interface GameBoardProps {
  definition: BoardDefinition
  state: GameState
  selectableClearings?: string[]
  selectedClearing?: string
  onClearingClick?: (clearingId: string) => void
}

const SUIT_COLORS: Record<Suit, string> = {
  fox: '#df7a33',
  rabbit: '#f4d56b',
  mouse: '#7fa46f',
  bird: '#6da3d9',
  none: '#d0c7b7',
}

const SUIT_ICONS: Record<Suit, string> = {
  fox: '🦊',
  rabbit: '🐰',
  mouse: '🐭',
  bird: '🕊️',
  none: '🌲',
}

const FACTION_COLORS: Record<FactionId, string> = {
  marquise: '#d96a3d',
  eyrie: '#2f5faf',
  woodland_alliance: '#2f8c5b',
}

const CLEARING_RADIUS = 70
const MIN_ZOOM = 0.55
const MAX_ZOOM = 2.2
const ZOOM_STEP = 0.12

export const GameBoard = ({
  definition,
  state,
  selectableClearings = [],
  selectedClearing,
  onClearingClick,
}: GameBoardProps) => {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const pointerOrigin = useRef<{ x: number; y: number } | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const initialScaleSet = useRef(false)

  const edges = useMemo(() => {
    const unique = new Set<string>()
    const pairs: Array<[number, number]> = []
    definition.clearings.forEach((clearing, clearingIndex) => {
      clearing.adjacentClearings.forEach(adjacentId => {
        const adjacentIndex = definition.clearings.findIndex(c => c.id === adjacentId)
        if (adjacentIndex === -1) return
        const key = [clearingIndex, adjacentIndex].sort().join('-')
        if (unique.has(key)) return
        unique.add(key)
        pairs.push([clearingIndex, adjacentIndex])
      })
    })
    return pairs
  }, [definition])

  const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))

  // Calculate optimal initial scale to fit the board in the viewport and center it
  useEffect(() => {
    const element = viewportRef.current
    if (!element || initialScaleSet.current) return

    const viewportWidth = element.clientWidth
    const viewportHeight = element.clientHeight

    const scaleX = viewportWidth / BOARD_DIMENSIONS.width
    const scaleY = viewportHeight / BOARD_DIMENSIONS.height
    const optimalScale = Math.min(scaleX, scaleY) * 0.95

    const clampedScale = clampZoom(optimalScale)
    setScale(clampedScale)

    const scaledWidth = BOARD_DIMENSIONS.width * clampedScale
    const scaledHeight = BOARD_DIMENSIONS.height * clampedScale
    const offsetX = (viewportWidth - scaledWidth) / 2
    const offsetY = (viewportHeight - scaledHeight) / 2
    setOffset({ x: offsetX, y: offsetY })

    initialScaleSet.current = true
  }, [])

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP
      setScale(prev => clampZoom(prev + delta))
    }
    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => element.removeEventListener('wheel', handleWheel)
  }, [])

  const isBoardControl = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false
    return Boolean(target.closest('[data-board-control="true"]'))
  }

  const beginPan: React.PointerEventHandler<HTMLDivElement> = event => {
    if (event.button !== 0) return
    if (isBoardControl(event.target)) return
    pointerOrigin.current = { x: event.clientX, y: event.clientY }
    setIsPanning(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const updatePan: React.PointerEventHandler<HTMLDivElement> = event => {
    if (!isPanning || !pointerOrigin.current) return
    const dx = event.clientX - pointerOrigin.current.x
    const dy = event.clientY - pointerOrigin.current.y
    pointerOrigin.current = { x: event.clientX, y: event.clientY }
    setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }))
  }

  const endPan: React.PointerEventHandler<HTMLDivElement> = event => {
    if (!isPanning) return
    setIsPanning(false)
    pointerOrigin.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const resetView = () => {
    const element = viewportRef.current
    if (!element) return

    const viewportWidth = element.clientWidth
    const viewportHeight = element.clientHeight
    const scaleX = viewportWidth / BOARD_DIMENSIONS.width
    const scaleY = viewportHeight / BOARD_DIMENSIONS.height
    const optimalScale = Math.min(scaleX, scaleY) * 0.95

    const clampedScale = clampZoom(optimalScale)
    setScale(clampedScale)

    // Center the board
    const scaledWidth = BOARD_DIMENSIONS.width * clampedScale
    const scaledHeight = BOARD_DIMENSIONS.height * clampedScale
    const offsetX = (viewportWidth - scaledWidth) / 2
    const offsetY = (viewportHeight - scaledHeight) / 2
    setOffset({ x: offsetX, y: offsetY })
  }

  return (
    <Viewport
      ref={viewportRef}
      onPointerDown={beginPan}
      onPointerMove={updatePan}
      onPointerUp={endPan}
      onPointerLeave={endPan}
      data-panning={isPanning}
    >
      <BoardSurface
        style={{
          // width: BOARD_DIMENSIONS.width,
          // height: BOARD_DIMENSIONS.height,
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
        }}
      >
        <Links width={BOARD_DIMENSIONS.width} height={BOARD_DIMENSIONS.height}>
          {edges.map(([fromIndex, toIndex], idx) => {
            const from = definition.clearings[fromIndex]
            const to = definition.clearings[toIndex]
            return (
              <line
                key={idx}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="#50361cff"
                strokeWidth={14}
                strokeLinecap="round"
                opacity={0.35}
              />
            )
          })}
        </Links>

        {definition.clearings.map(clearing => {
          const clearingState = state.board.clearings[clearing.id]
          const warriors = Object.entries(clearingState?.warriors ?? {})
          const isSelectable = selectableClearings.includes(clearing.id)
          const isSelected = selectedClearing === clearing.id

          // Group buildings by faction and type
          const buildingGroups = new Map<string, { faction: FactionId; type: BuildingType; count: number }>()
          clearingState?.buildings.forEach(building => {
            const key = `${building.faction}_${building.type}`
            const existing = buildingGroups.get(key)
            if (existing) {
              existing.count++
            } else {
              buildingGroups.set(key, { faction: building.faction, type: building.type, count: 1 })
            }
          })

          // Group tokens by faction and type
          const tokenGroups = new Map<string, { faction: FactionId; type: TokenType; count: number }>()
          clearingState?.tokens.forEach(token => {
            const key = `${token.faction}_${token.type}`
            const existing = tokenGroups.get(key)
            if (existing) {
              existing.count++
            } else {
              tokenGroups.set(key, { faction: token.faction, type: token.type, count: 1 })
            }
          })

          return (
            <ClearingNode
              key={clearing.id}
              style={{ left: clearing.x, top: clearing.y }}
              data-selectable={isSelectable}
              data-selected={isSelected}
              data-board-control={isSelectable ? 'true' : undefined}
            >
              <ClearingCircle
                suit={clearing.suit}
                data-selectable={isSelectable}
                data-selected={isSelected}
                data-board-control={isSelectable ? 'true' : undefined}
                onClick={e => {
                  if (isSelectable) {
                    e.stopPropagation()
                    onClearingClick?.(clearing.id)
                  }
                }}
                style={{ cursor: isSelectable ? 'pointer' : 'default' }}
              >
                <span>{SUIT_ICONS[clearing.suit]}</span>
                <ClearingId>#{clearing.id.toUpperCase()}</ClearingId>
                <SlotsLabel>{clearing.buildingSlots} slots</SlotsLabel>
              </ClearingCircle>
              <BadgeRow>
                {warriors.map(([faction, amount]) => (
                  <Badge key={`${clearing.id}_${faction}`} color={FACTION_COLORS[faction as FactionId]}>
                    ⚔ {amount} {formatFaction(faction as FactionId)}
                  </Badge>
                ))}
                {Array.from(buildingGroups.values()).map((group, idx) => (
                  <Badge key={`${clearing.id}_building_${idx}`} color={FACTION_COLORS[group.faction]}>
                    🏛 {group.count > 1 ? `${group.count}× ` : ''}
                    {formatBuilding(group.type)}
                  </Badge>
                ))}
                {Array.from(tokenGroups.values()).map((group, idx) => (
                  <Badge key={`${clearing.id}_token_${idx}`} color={FACTION_COLORS[group.faction]}>
                    {group.count > 1 ? `${group.count}× ` : ''}
                    {formatToken(group.type)}
                  </Badge>
                ))}
              </BadgeRow>
            </ClearingNode>
          )
        })}
      </BoardSurface>
      <ZoomPanel data-board-control="true" onPointerDown={event => event.stopPropagation()}>
        <ZoomButton data-board-control="true" onClick={() => setScale(prev => clampZoom(prev + ZOOM_STEP))}>
          +
        </ZoomButton>
        <ZoomButton data-board-control="true" onClick={() => setScale(prev => clampZoom(prev - ZOOM_STEP))}>
          -
        </ZoomButton>
        <ZoomButton data-board-control="true" onClick={resetView}>
          Reset
        </ZoomButton>
      </ZoomPanel>
    </Viewport>
  )
}

const formatFaction = (faction: FactionId) => {
  if (faction === 'marquise') return 'Cat'
  if (faction === 'eyrie') return 'Bird'
  return 'WA'
}

const formatBuilding = (type: BuildingInstance['type']) => {
  switch (type) {
    case 'sawmill':
      return 'Mill'
    case 'workshop':
      return 'Shop'
    case 'recruiter':
      return 'Recruiter'
    case 'roost':
      return 'Roost'
    case 'base_mouse':
      return 'Base'
    case 'base_rabbit':
      return 'Base'
    case 'base_fox':
      return 'Base'
    case 'keep':
      return 'Keep'
    default:
      return type
  }
}

const formatToken = (type: TokenType) => {
  if (type === 'wood') return '🌲 Wood'
  if (type === 'sympathy') return '✊ Sympathy'
  return 'Token'
}

const Viewport = styled.div<{ 'data-panning'?: boolean }>`
  position: relative;
  overflow: hidden;
  border: 4px solid #3d2a18;
  border-radius: 24px;
  background: linear-gradient(145deg, #f5e5bc, #cbb189);
  ${({ ['data-panning']: dataPanning }) =>
    dataPanning &&
    css`
      min-height: 520px;
    `}
  touch-action: none;
  user-select: none;
  cursor: ${({ ['data-panning']: dataPanning }) => (dataPanning ? 'grabbing' : 'grab')};
  width: 100%;
  max-width: 100%;
  min-width: 0;
`

const BoardSurface = styled.div`
  position: relative;
  transform-origin: 0 0;
  background-image: radial-gradient(circle at 20% 20%, rgba(255, 255, 255, 0.3), transparent 60%),
    radial-gradient(circle at 80% 40%, rgba(255, 255, 255, 0.25), transparent 55%);
  background-color: rgba(255, 255, 255, 0.2);
`

const Links = styled.svg`
  position: absolute;
  inset: 0;
  pointer-events: none;
`

const ClearingNode = styled.div`
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 160px;
`

const ClearingCircle = styled.div<{ suit: Suit }>`
  ${({ suit }) => css`
    width: ${CLEARING_RADIUS * 2}px;
    height: ${CLEARING_RADIUS * 2}px;
    border-radius: 50%;
    background: ${SUIT_COLORS[suit]};
    border: 4px solid #3b2a14;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #1f1205;
    font-weight: 700;
    letter-spacing: 0.05em;
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.25);
    text-align: center;
    padding: 12px;
    transition: all 0.2s ease;

    span {
      font-size: 32px;
      line-height: 1;
    }

    &[data-selectable='true'] {
      animation: pulse 1.5s ease-in-out infinite;
      border-color: #ff6b35;
      border-width: 5px;
    }

    &[data-selected='true'] {
      border-color: #ff6b35;
      border-width: 6px;
      box-shadow: 0 0 20px rgba(255, 107, 53, 0.8), 0 12px 24px rgba(0, 0, 0, 0.25);
      animation: none;
    }

    @keyframes pulse {
      0%,
      100% {
        box-shadow: 0 0 10px rgba(255, 107, 53, 0.5), 0 12px 24px rgba(0, 0, 0, 0.25);
      }
      50% {
        box-shadow: 0 0 20px rgba(217, 106, 61, 0.8), 0 12px 24px rgba(0, 0, 0, 0.25);
      }
    }
  `}
`

const ClearingId = styled.div`
  font-size: 13px;
  letter-spacing: 0.08em;
  opacity: 0.7;
  font-weight: 600;
  color: #34495e;
  position: relative;
  z-index: 10;
`

const SlotsLabel = styled.div`
  font-size: 10px;
  opacity: 0.6;
  color: #7f8c8d;
  position: relative;
  z-index: 10;
`

const BadgeRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
`

const Badge = styled.div<{ color: string }>`
  ${({ color }) => css`
    background: ${color};
    color: white;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.03em;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2), inset 0 0 0 1px rgba(255, 255, 255, 0.2);
    white-space: nowrap;
    text-transform: uppercase;
  `}
`

const ZoomPanel = styled.div`
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const ZoomButton = styled.button`
  border: none;
  border-radius: 10px;
  background: rgba(34, 23, 12, 0.85);
  color: white;
  padding: 6px 14px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 120ms ease, background 120ms ease;

  :hover {
    transform: translateY(-1px);
    background: rgba(34, 23, 12, 1);
  }

  :active {
    transform: translateY(1px);
  }
`
