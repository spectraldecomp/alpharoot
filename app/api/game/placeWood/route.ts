import { PlaceWoodActionRequest, PlaceWoodActionResponse, executePlaceWoodAction } from '@/gameState/actions'
import { apiController } from '@/utils/api-controller'

export const POST = apiController<PlaceWoodActionRequest, PlaceWoodActionResponse>(async payload =>
  executePlaceWoodAction(payload),
)

