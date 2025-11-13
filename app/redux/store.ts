import { configureStore } from '@reduxjs/toolkit'
import { commonApi } from './api/common'

export const makeStore = () => {
  return configureStore({
    reducer: {
      [commonApi.reducerPath]: commonApi.reducer,
    },
    middleware: getDefaultMiddleware => getDefaultMiddleware().concat(commonApi.middleware),
  })
}

export type AppStore = ReturnType<typeof makeStore>
export type RootState = ReturnType<AppStore['getState']>
export type AppDispatch = AppStore['dispatch']
