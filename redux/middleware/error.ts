import { isRejectedWithValue } from '@reduxjs/toolkit'
import type { Middleware } from '@reduxjs/toolkit'

type ErrorPayload = {
  data?: {
    message?: string
  }
}

export const rtkQueryErrorCatcher: Middleware = () => next => action => {
  if (isRejectedWithValue(action)) {
    const payload = action.payload as ErrorPayload | undefined
    const message = payload?.data?.message ?? action.error?.message ?? 'Request failed'
    alert(message)
  }

  return next(action)
}
