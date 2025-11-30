import { GameState } from '@/gameState/schema'

const formatDecreeSummary = (state: GameState) => {
  const { decree } = state.factions.eyrie
  return `Decree entries · Recruit ${decree.columns.recruit.length} | Move ${decree.columns.move.length} | Battle ${decree.columns.battle.length} | Build ${decree.columns.build.length}`
}

const formatRoostSummary = (state: GameState) => {
  const roostsOnMap = state.factions.eyrie.roostsOnMap
  const roostTrackStep = state.factions.eyrie.roostTrack.roostsPlaced
  return `Roosts on map: ${roostsOnMap} · Track step: ${roostTrackStep}`
}

export const buildEyrieActionManagerPrompt = (state: GameState) => {
  return `
### Eyrie Dynasties Action Manager
${formatRoostSummary(state)}
${formatDecreeSummary(state)}

**Birdsong**
1. *Emergency Orders* – if your hand is empty, immediately draw 1 card (cards are abstract counts here, no suits to track).
2. *Add to the Decree* – add 1 or 2 cards to any columns, but only 1 can be a bird card per turn. Because we do not track suits, treat each new card as a generic obligation that can target any clearing you can legally use that phase.
3. *A New Roost* – if no roosts remain in play, place 1 roost plus 3 warriors in the legal clearing with the fewest total warriors that can still fit those pieces.

**Daylight**
1. *Craft* – spend available roost activations before the Decree to craft items. Ignore listed VP (Disdain for Trade) and instead award 1 VP per crafted item, though other bonuses like Legendary Forge still apply conceptually.
2. *Resolve the Decree* – go column by column (recruit → move → battle → build). For each card in a column you must fully complete the action; order within a column is flexible.
   - **Recruit** – place 1 warrior in any clearing containing a roost. With abstract suits, simply ensure the clearing you pick contains a roost and has space for the warrior.
   - **Move** – each card forces one move that originates from a clearing with Eyrie presence. Moves must be adjacent and leave at least one warrior behind whenever possible.
   - **Battle** – initiate a battle in a clearing containing both Eyrie warriors and an enemy piece. Remember Guerrilla modifiers do not apply to Eyrie unless the opponent grants them.
   - **Build** – place a roost in a clearing you rule that currently lacks a roost and still has a free building slot. Respect Lords of the Forest for ruling ties: you must have an Eyrie piece present to claim rule.
   - **Failure Handling** – if any single card cannot be satisfied exactly when encountered, you enter Turmoil immediately.

**Turmoil Protocol**
1. Lose 1 VP for every bird card currently tucked (Loyal Viziers count).
2. Discard every Decree card other than the two Loyal Viziers.
3. Replace your leader (flip current, choose a face-up option, tuck Viziers into the new leader’s columns). If none remain face up, refresh all leaders first.
4. End Daylight and proceed to Evening without taking further Daylight actions.

**Evening**
1. Score VP equal to the rightmost empty slot on the roost track (more roosts = more points).
2. Draw 1 card plus bonuses indicated on your faction board, then discard down to 5 cards. Again, treat cards as anonymous counts rather than suited resources.

**Constant Reminders**
- *Lords of the Forest* – you rule on ties only if an Eyrie piece is present.
- *Disdain for Trade* – crafting always yields exactly 1 VP per item unless explicit bonuses say otherwise.
- The simulation does not track card suits, so when a rule references “matching suits” choose any legal clearing you can justify based on board state and be explicit about why it fulfills the obligation.
- When describing an action, reference which Decree entry it satisfies (e.g., “Move #1 of 2 – shifted warriors from c5→c6 to keep the column legal”) to avoid rule violations.
`.trim()
}

