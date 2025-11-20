import { Skill } from './skills'

export interface PlayerProfile {
  proficiencyLevel: 'Beginner' | 'Intermediate' | 'Advanced'
  playStyle: 'Aggressive' | 'Defensive' | 'Balanced' | 'Cooperative'
}

export const SCENARIOS: {
  title: string
  type: Skill
  difficulty: 0 | 1 | 2
  eyrieProfile: PlayerProfile
  allianceProfile: PlayerProfile
}[] = [
  {
    title: 'Eyrie Dominion',
    type: Skill.Diplomacy,
    difficulty: 0,
    eyrieProfile: { proficiencyLevel: 'Beginner', playStyle: 'Defensive' },
    allianceProfile: { proficiencyLevel: 'Beginner', playStyle: 'Cooperative' },
  },
  {
    title: 'Martial Law',
    type: Skill.ClearingControl,
    difficulty: 1,
    eyrieProfile: { proficiencyLevel: 'Intermediate', playStyle: 'Balanced' },
    allianceProfile: { proficiencyLevel: 'Intermediate', playStyle: 'Aggressive' },
  },
  {
    title: 'Conquerors',
    type: Skill.ClearingControl,
    difficulty: 2,
    eyrieProfile: { proficiencyLevel: 'Advanced', playStyle: 'Aggressive' },
    allianceProfile: { proficiencyLevel: 'Advanced', playStyle: 'Defensive' },
  },
]
