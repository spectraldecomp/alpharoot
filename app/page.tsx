'use client'
import { useCallback } from 'react'
import { useChatCompleteMutation } from './redux/api/common'

export default function Home() {
  const [chatComplete, { data }] = useChatCompleteMutation()

  const handleClick = useCallback(async () => {
    chatComplete({ conversation: [{ role: 'user', content: 'hello world' }] })
  }, [chatComplete])

  return (
    <main>
      <button onClick={handleClick}>Hello World</button>
      <div>{data?.content}</div>
    </main>
  )
}
