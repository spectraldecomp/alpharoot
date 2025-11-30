import { GameState } from '@/gameState/schema'

const formatAllianceSummary = (state: GameState) => {
  const { bases, officers, sympathyOnMap } = state.factions.woodland_alliance
  const plantedBases = Object.entries(bases)
    .filter(([, present]) => present)
    .map(([suit]) => suit)
    .join(', ') || 'none'
  return `Sympathy tokens: ${sympathyOnMap} · Officers: ${officers} · Bases in play: ${plantedBases}`
}

export const buildWoodlandAllianceActionManagerPrompt = (state: GameState) => {
  return `
### Woodland Alliance Action Manager
${formatAllianceSummary(state)}

**Birdsong**
1. *Revolt (any number of times)* – choose a sympathetic clearing that matches a base slot on your board, spend two supporters of that suit (supporters are tracked abstractly with counts, not specific cards), remove every enemy piece there, place the matching base, add warriors equal to the number of sympathetic clearings of that suit, and add one warrior to the Officers box. Award VP for each hostile token/building removed.
2. *Spread Sympathy (any number of times)* – target an unsympathetic clearing adjacent to sympathy; if none exist you may start anywhere. Spend the required supporters shown above the next sympathy token on your track (add +1 supporter cost if Martial Law applies: three or more enemy warriors present). Place the token and score the VP printed on the track slot you just revealed. Only one sympathy token may sit in a clearing.

**Daylight Actions (any order, unlimited repetitions)**
1. *Craft* – activate sympathy tokens in matching suits to craft a card. Because cards lack suits in this simulation, simply verify you have enough sympathy tokens to justify the craft and remember crafting consumes the card but sympathy stays.
2. *Mobilize* – add a card from hand to the Supporters stack (again, cards are unnamed, just track counts).
3. *Train* – spend a card whose suit matches a base already on the map to move one warrior from supply into the Officers box.

**Evening: Military Operations**
You may take a number of operations equal to your officers (current officers: ${state.factions.woodland_alliance.officers}). Operations are:
- *Move* – one standard move.
- *Battle* – initiate a battle.
- *Recruit* – place one warrior in a base clearing of the matching suit.
- *Organize* – remove one Alliance warrior from an unsympathetic clearing, place a sympathy token there, and score the newly revealed VP.
Order and mix of operations are flexible, but the total count cannot exceed your officers.

**Evening Cleanup**
Draw 1 card plus any bonuses shown on uncovered draw slots, then discard down to 5 cards. As before, cards are just numeric counts with no suit tracking.

**Always-On Rules**
- *Guerrilla War* – whenever the Alliance defends, they deal hits equal to the higher die and attackers use the lower die.
- *Supporters Stack Capacity* – without any bases you can store at most 5 supporters; once a base is built the limit becomes unlimited. When gaining a supporter at capacity, discard it instead.
- *Removing Bases* – whenever an Alliance base is removed, discard all supporters that match that base’s printed suit (including bird cards) and remove half of your officers, rounded up. If all bases are gone, immediately discard supporters down to 5.
- *Outrage* – whenever an opponent removes a sympathy token or moves warriors into a sympathetic clearing, they must provide you a matching card; if they cannot, reveal their hand and draw from the deck instead. Track this narratively since explicit card identities are absent.
- Place sympathy only where legal (one per clearing, must respect adjacency unless no sympathy is on the map). Remember Martial Law adds +1 supporter to the cost.

Clarify within each action how the requirement is met (e.g., “Organize #2 – pulled a warrior from unsympathetic c5 to seed sympathy and score the 2 VP slot”) so the move log proves legality.
`.trim()
}

