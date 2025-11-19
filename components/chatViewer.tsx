import { css } from '@emotion/react'
import styled from '@emotion/styled'
import { TextLoading } from '@wookiejin/react-component'
import { Color } from '@wookiejin/react-component/dist/cjs/themes/default/color'
import Image from 'next/image'
import { Fragment, memo } from 'react'

const PROFILE_SIZE = 40

interface Props {
  conversation: { role: 'assistant' | 'user' | 'system'; content: string; faction?: string }[]
  isReplying?: boolean
  typingAvatar?: string
}

export const ChatViewer = memo(function ChatViewer({
  conversation,
  isReplying = false,
  typingAvatar,
}: Props) {
  const typingImage =
    typingAvatar ?? (conversation.length && conversation[0].role === 'system' ? 'tutor' : 'typing')

  return (
    <Container>
      {conversation.map((message, i) => {
        if (message.role === 'assistant') {
          return (
            <Fragment key={i}>
              <MessageRow marginBottom={i < conversation.length - 1 ? 8 : 0}>
                <Profile>
                  <Image
                    src={`/image/${message.faction ?? 'tutor'}.png`}
                    width={PROFILE_SIZE}
                    height={PROFILE_SIZE}
                    alt=""
                  />
                </Profile>
                <Bubble fill="#fbf2d1ff" color="Primary">
                  {message.content}
                </Bubble>
              </MessageRow>
            </Fragment>
          )
        } else if (message.role === 'user') {
          return (
            <UserMessageRow key={i}>
              <Bubble fill="black" color="Contrast">
                {message.content}
              </Bubble>
              {message.faction && (
                <Profile>
                  <Image
                    src={`/image/${message.faction ?? 'cat'}.png`}
                    width={PROFILE_SIZE}
                    height={PROFILE_SIZE}
                    alt=""
                  />
                </Profile>
              )}
            </UserMessageRow>
          )
        }
      })}
      {isReplying && (
        <MessageRow>
          <Profile>
            <Image src={`/image/${typingImage}.png`} width={PROFILE_SIZE} height={PROFILE_SIZE} alt="" />
          </Profile>
          <TextLoading fill="Contrast" marginTop={12} />
        </MessageRow>
      )}
    </Container>
  )
})

const Container = styled.div`
  padding-bottom: 16px;
`

const MessageRow = styled.div<{ marginBottom?: number }>`
  ${({ marginBottom = 0 }) => css`
    display: grid;
    grid-template-columns: auto fit-content(65%) auto;
    gap: 8px;
    justify-content: flex-start;
    align-items: flex-start;
    margin-bottom: ${marginBottom}px;
  `}
`

const UserMessageRow = styled.div`
  display: grid;
  justify-content: flex-end;
  align-items: flex-start;
  margin-bottom: 8px;
  grid-template-columns: fit-content(65%) auto;
  gap: 8px;
`

const Bubble = styled.div<{ fill: string; color: Color }>`
  ${({ theme, fill, color }) => css`
    background: ${fill};
    ${theme.color[color]}
    ${theme.font.Body}
    padding: 8px;
    border-radius: 8px;
    white-space: pre-wrap;
    min-width: 0;
  `}
`

const Profile = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
`
