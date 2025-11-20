'use client'
import { SCENARIOS } from '@/constants/scenarios'
import styled from '@emotion/styled'
import { Metamorphous } from 'next/font/google'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

const DIFFICULTIES = ['Easy', 'Medium', 'Hard']

const metamorphous = Metamorphous({
  weight: '400',
})

export default function Home() {
  const { push } = useRouter()

  return (
    <main>
      <Container>
        {SCENARIOS.map(({ title, type, difficulty }, i) => (
          <Card key={i} onClick={() => push(`/learn?scenario=${i}`)}>
            <CardImage src={`/image/root${(i % 3) + 1}.png`} fill={true} alt="" />
            <DifficultyTag>{DIFFICULTIES[difficulty]}</DifficultyTag>
            <Tag>{type}</Tag>
            <Title className={metamorphous.className}>{title}</Title>
          </Card>
        ))}
        <Card onClick={() => push('/create')}>
          <CardImage src={`/image/root4.png`} fill={true} alt="" />
          <Title className={metamorphous.className}>Create Your Own Scenario!</Title>
        </Card>
      </Container>
    </main>
  )
}

const Card = styled.button`
  cursor: pointer;
  position: relative;
  width: 100%;
  height: 200px;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: rgba(0, 0, 0, 0.1) 0px 4px 12px;

  :hover {
    box-shadow: rgba(0, 0, 0, 0.2) 0px 6px 16px;
  }
`

const Title = styled.div`
  position: absolute;
  z-index: 1;
  bottom: 16px;
  left: 16px;
  background-color: rgba(255, 255, 255, 0.7);
  padding: 4px 12px;
  font-weight: bold;
  text-align: left;
  font-size: 24px;
  max-width: calc(100% - 32px);
  pointer-events: none;
  text-align: center;
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
  position: absolute;
  top: 16px;
  left: 16px;
`

const CardImage = styled(Image)`
  object-fit: cover;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;

  :hover {
    transform: scale(1.1);
    transition: transform 0.3s ease;
  }
`

const DifficultyTag = styled.div`
  position: absolute;
  top: 16px;
  right: 16px;
  background-color: rgba(0, 0, 0, 0.6);
  color: white;
  padding: 4px 8px;
  font-size: 12px;
  border-radius: 4px;
`
