export interface PlayerProfile {
  proficiencyLevel: 'Beginner' | 'Intermediate' | 'Advanced'
  playStyle: 'Aggressive' | 'Defensive' | 'Balanced' | 'Cooperative'
}

export const SCENARIOS: {
  title: string
  type: string
  difficulty: 0 | 1 | 2
  playerProfile: PlayerProfile
  eyrieProfile: PlayerProfile
  allianceProfile: PlayerProfile
}[] = [
  {
    title: 'Eyrie Dominion',
    type: 'Diplomacy',
    difficulty: 0,
    playerProfile: { proficiencyLevel: 'Beginner', playStyle: 'Balanced' },
    eyrieProfile: { proficiencyLevel: 'Beginner', playStyle: 'Defensive' },
    allianceProfile: { proficiencyLevel: 'Beginner', playStyle: 'Cooperative' },
  },
  {
    title: 'Martial Law',
    type: 'Clearing Control',
    difficulty: 1,
    playerProfile: { proficiencyLevel: 'Intermediate', playStyle: 'Aggressive' },
    eyrieProfile: { proficiencyLevel: 'Intermediate', playStyle: 'Balanced' },
    allianceProfile: { proficiencyLevel: 'Intermediate', playStyle: 'Aggressive' },
  },
  {
    title: 'Conquerors',
    type: 'Combat Skills',
    difficulty: 2,
    playerProfile: { proficiencyLevel: 'Advanced', playStyle: 'Defensive' },
    eyrieProfile: { proficiencyLevel: 'Advanced', playStyle: 'Aggressive' },
    allianceProfile: { proficiencyLevel: 'Advanced', playStyle: 'Defensive' },
  },
]
