import { BoardDefinition } from './schema'

export const BOARD_DIMENSIONS = {
  width: 1200,
  height: 900,
}

export const WOODLAND_BOARD_DEFINITION: BoardDefinition = {
  clearings: [
    {
      id: 'c1',
      suit: 'fox',
      buildingSlots: 1,
      adjacentClearings: ['c2', 'c3', 'c5'],
      x: 120,
      y: 80,
    },
    {
      id: 'c2',
      suit: 'rabbit',
      buildingSlots: 2,
      adjacentClearings: ['c1', 'c3', 'c4', 'c6'],
      x: 320,
      y: 200,
    },
    {
      id: 'c3',
      suit: 'rabbit',
      buildingSlots: 2,
      adjacentClearings: ['c1', 'c2', 'c4', 'c6'],
      x: 820,
      y: 130,
    },
    {
      id: 'c4',
      suit: 'mouse',
      buildingSlots: 2,
      adjacentClearings: ['c2', 'c3', 'c6'],
      x: 560,
      y: 260,
    },
    {
      id: 'c5',
      suit: 'mouse',
      buildingSlots: 2,
      adjacentClearings: ['c1', 'c6', 'c7'],
      x: 160,
      y: 340,
    },
    {
      id: 'c6',
      suit: 'mouse',
      buildingSlots: 3,
      adjacentClearings: ['c2', 'c3', 'c4', 'c5', 'c7', 'c8'],
      x: 560,
      y: 460,
    },
    {
      id: 'c7',
      suit: 'fox',
      buildingSlots: 2,
      adjacentClearings: ['c5', 'c6', 'c8', 'c10'],
      x: 220,
      y: 580,
    },
    {
      id: 'c8',
      suit: 'mouse',
      buildingSlots: 3,
      adjacentClearings: ['c6', 'c7', 'c9', 'c11'],
      x: 600,
      y: 640,
    },
    {
      id: 'c9',
      suit: 'mouse',
      buildingSlots: 3,
      adjacentClearings: ['c8', 'c11', 'c12'],
      x: 980,
      y: 560,
    },
    {
      id: 'c10',
      suit: 'fox',
      buildingSlots: 1,
      adjacentClearings: ['c7', 'c11'],
      x: 320,
      y: 820,
    },
    {
      id: 'c11',
      suit: 'rabbit',
      buildingSlots: 2,
      adjacentClearings: ['c8', 'c9', 'c10', 'c12'],
      x: 760,
      y: 820,
    },
    {
      id: 'c12',
      suit: 'mouse',
      buildingSlots: 2,
      adjacentClearings: ['c9', 'c11'],
      x: 1100,
      y: 820,
    },
  ],
}


