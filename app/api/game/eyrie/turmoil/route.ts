import { triggerEyrieTurmoil } from '@/gameState/actions'
import { GameState } from '@/gameState/schema'
import { apiController } from '@/utils/api-controller'

type RequestBody = {
  state: GameState
}

type ResponseBody = {
  state: GameState
  lostPoints: number
}

export const POST = apiController<RequestBody, ResponseBody>(async ({ state }) => {
  return triggerEyrieTurmoil(state)
})

