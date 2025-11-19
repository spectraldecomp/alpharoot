import { RecruitActionRequest, RecruitActionResponse, executeRecruitAction } from '@/gameState/actions'
import { apiController } from '@/utils/api-controller'

export const POST = apiController<RecruitActionRequest, RecruitActionResponse>(async payload => executeRecruitAction(payload))
