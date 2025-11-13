import { NextRequest, NextResponse } from 'next/server'

export function apiController<P, R>(handler: (params: P) => Promise<R>) {
  return async (req: NextRequest) => {
    try {
      const reqBody = await req.json()
      const res = await handler(reqBody as P)
      return NextResponse.json(res, { status: 200 })
    } catch (error) {
      console.error(req.url, (error as any).toString())
      if (error instanceof Error) {
        const { message, cause } = error
        if (cause === 403) {
          return NextResponse.json({ message }, { status: 403 })
        }
      }
      return NextResponse.json({ message: (error as any).toString() }, { status: 500 })
    }
  }
}
