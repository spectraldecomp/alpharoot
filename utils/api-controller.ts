import { NextRequest, NextResponse } from 'next/server'

export function apiController<P, R>(handler: (params: P) => Promise<R>) {
  return async (req: NextRequest) => {
    try {
      const reqBody = await req.json()
      const res = await handler(reqBody as P)
      return NextResponse.json(res, { status: 200 })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(req.url, errorMessage)
      if (error instanceof Error && error.cause === 403) {
        return NextResponse.json({ message: errorMessage }, { status: 403 })
      }
      return NextResponse.json({ message: errorMessage }, { status: 500 })
    }
  }
}
