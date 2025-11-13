import { isRejectedWithValue } from '@reduxjs/toolkit'
import type { MiddlewareAPI, Middleware } from '@reduxjs/toolkit'

export const rtkQueryErrorCatcher: Middleware = (api: MiddlewareAPI) => next => action => {
  if (isRejectedWithValue(action)) {
    const payload: any = action.payload
    const message = 'data' in payload ? (payload.data as { message: string })?.message : action.error.message
    alert(message)
  }

  return next(action)
}
