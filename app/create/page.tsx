'use client'
import { GameBoard } from '@/components/gameBoard'
import { SKILLS } from '@/constants/skills'
import { WOODLAND_BOARD_DEFINITION } from '@/gameState/boardDefinition'
import { useCreateGameStateMutation } from '@/redux/api/common'
import { css, ThemeProvider } from '@emotion/react'
import styled from '@emotion/styled'
import { DEFAULT_LIGHT_THEME, FillButton, SubHeaderText, TextInput } from '@wookiejin/react-component'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'

export default function Page() {
  const { push } = useRouter()
  const [skill, setSkill] = useState(SKILLS[0])
  const [description, setDescription] = useState('')
  const [createBoard, { isLoading, data }] = useCreateGameStateMutation()

  const create = useCallback(() => {
    createBoard({ skill, description })
  }, [createBoard, description, skill])

  const practice = useCallback(() => {
    if (data) {
      localStorage.setItem('customGameState', JSON.stringify(data.gameState))
      localStorage.setItem(
        'customScenario',
        JSON.stringify({
          title: 'Custom Scenario',
          type: skill,
          difficulty: 0,
          eyrieProfile: data.eyrieProfile,
          allianceProfile: data.allianceProfile,
        })
      )
      push('/learn?scenario=-1')
    }
  }, [data, push, skill])

  return (
    <ThemeProvider theme={DEFAULT_LIGHT_THEME}>
      <main>
        <Container>
          <SubHeaderText marginBottom={8}>1. Click the skills you want to improve.</SubHeaderText>
          {SKILLS.map(sk => (
            <Button key={sk} selected={skill === sk} onClick={() => setSkill(sk)}>
              {sk}
            </Button>
          ))}
          <SubHeaderText marginTop={16} marginBottom={8}>
            2. Describe the specific scenario you want to practice.
          </SubHeaderText>
          <DescriptionText
            value={description}
            onChange={setDescription}
            minRows={3}
            placeholder="Describe what you want to practice..."
            marginBottom={16}
          />
          <BlackButton onClick={create} marginBottom={16} disabled={isLoading}>
            Generate Board State and Players
          </BlackButton>
          {data && (
            <>
              <Profiles>
                <ProfileCard tone="#2f5faf">
                  <Image src="/image/eyrie.png" width={48} height={48} alt="" />
                  <ProfileTitle>Eyrie Dynasties</ProfileTitle>
                  <ProfileDetail>Level · {data.eyrieProfile.proficiencyLevel}</ProfileDetail>
                  <ProfileDetail>Style · {data.eyrieProfile.playStyle}</ProfileDetail>
                </ProfileCard>
                <ProfileCard tone="#2f8c5b">
                  <Image src="/image/alliance.png" width={48} height={48} alt="" />
                  <ProfileTitle>Woodland Alliance</ProfileTitle>
                  <ProfileDetail>Level · {data.allianceProfile.proficiencyLevel}</ProfileDetail>
                  <ProfileDetail>Style · {data.allianceProfile.playStyle}</ProfileDetail>
                </ProfileCard>
              </Profiles>
              <GameBoardWrapper>
                <GameBoard definition={WOODLAND_BOARD_DEFINITION} state={data.gameState} />
              </GameBoardWrapper>
              <BlackButton onClick={practice} marginTop={16}>
                Practice this Scenario
              </BlackButton>
            </>
          )}
        </Container>
      </main>
    </ThemeProvider>
  )
}

const Container = styled.div`
  max-width: 800px;
  margin: 0 auto;
  padding: 16px;
  padding-bottom: 40px;
`

const DescriptionText = styled(TextInput)`
  background-color: white;
`

const Button = styled.button<{ selected: boolean }>`
  ${({ selected }) => css`
    padding: 8px 16px;
    border: none;
    cursor: pointer;
    margin-right: 8px;
    border-radius: 8px;
    ${selected ? 'background-color: black; color: white;' : 'background-color: #f4d56b; color: black;'}
  `}
`

const BlackButton = styled(FillButton)`
  background-color: black;
  width: fit-content;
  font-size: 1.3rem;
  padding: 8px 16px;
`

const GameBoardWrapper = styled.div`
  min-height: 520px;
  display: flex;
  align-items: stretch;
  justify-content: center;
  width: 100%;
  min-width: 0;
  overflow: hidden;
`

const Profiles = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin: 12px 0 20px;
`

const ProfileCard = styled.div<{ tone: string }>`
  ${({ tone }) => css`
    border-radius: 14px;
    background: linear-gradient(135deg, ${tone}20, ${tone}08);
    border: 1px solid ${tone}40;
    padding: 14px 16px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
  `}
`

const ProfileTitle = styled.div`
  font-weight: 800;
  font-size: 1rem;
  margin-bottom: 6px;
`

const ProfileDetail = styled.div`
  font-size: 0.95rem;
  color: #3a3a3a;
`
