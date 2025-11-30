import { performEyrieEvening } from '@/gameState/actions'
import { GameState } from '@/gameState/schema'
import { apiController } from '@/utils/api-controller'

type RequestBody = {
  state: GameState
}

type ResponseBody = {
  state: GameState
  log: string[]
}

export const POST = apiController<RequestBody, ResponseBody>(async ({ state }) => {
  return performEyrieEvening(state)
})

