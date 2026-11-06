import boards from './practice-boards.json' with {type: 'json'};
import { cells } from './engine.js';

export const practiceBoards = boards;

export function createPracticeState(number) {
  const config = boards[number - 1];
  if (!config || config.number !== number) throw new RangeError('Unknown practice board');
  const placed = config.placed.map(piece => ({...piece, ids: [...piece.ids], v: piece.v.map(p => [...p]), player: 2}));
  const board = Array(cells.length).fill(0);
  placed.forEach(piece => piece.ids.forEach(id => board[id] = 3));
  return {
    board, placed, hands: config.hands.map(hand => [...hand]), scores: [...config.scores],
    turn: config.turn, mode: 'practice', practiceNumber: number, over: false, turnsPlayed: 0,
  };
}

export const practiceWon = state => state.mode === 'practice' && state.over && state.scores[0] > state.scores[1];

// Use the ROM's opening only when its piece is actually in the current hand.
export function practiceOpening(state, legal) {
  if (state.mode !== 'practice' || state.turnsPlayed !== 0) return null;
  const opening = boards[state.practiceNumber - 1].opening;
  return opening && legal.find(move => move.type === opening.type && move.rot === opening.rot && move.x === opening.x && move.y === opening.y);
}
