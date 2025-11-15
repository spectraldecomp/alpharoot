'use client'
import { useCallback } from 'react'
import { useChatCompleteMutation } from '@/redux/api/common'
import Image from 'next/image'
import styled from '@emotion/styled'

export default function Home() {
  const [chatComplete, { data }] = useChatCompleteMutation()

  const handleClick = useCallback(async () => {
    chatComplete({ conversation: [{ role: 'user', content: 'hello world' }] })
  }, [chatComplete])

  return (
    <main>
      <button onClick={handleClick}>Hello World</button>
      <div>{data?.content}</div>
      <Container>
        {SCENARIOS.map(({ title, type, difficulty }, i) => (
          <Card key={i}>
            <Image
              src={`/image/root${i + 1}.png`}
              fill={true}
              style={{ objectFit: 'cover', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
              alt=""
            />
            <Title>
              <Tag>{type}</Tag>
              {title}
            </Title>
          </Card>
        ))}
      </Container>
    </main>
  )
}

const SCENARIOS = [
  { title: 'Eyrie Dominion', type: 'Diplomacy', difficulty: 1 },
  { title: 'Martial Law', type: 'Clearing Control', difficulty: 2 },
  { title: 'Conquerors', type: 'Combat Skills', difficulty: 3 },
]

const Card = styled.button`
  cursor: pointer;
  position: relative;
  width: 100%;
  height: 200px;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: rgba(0, 0, 0, 0.1) 0px 4px 12px;
`

const Title = styled.div`
  position: absolute;
  z-index: 1;
  bottom: 16px;
  left: 16px;
  background-color: rgba(255, 255, 255, 0.8);
  padding: 4px 12px;
  font-weight: 600;
  text-align: left;
  font-size: 18px;
`

const Container = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  padding: 16px;
`

const Tag = styled.div`
  padding: 4px;
  background-color: coral;
  color: white;
  font-size: 12px;
  width: fit-content;
`
