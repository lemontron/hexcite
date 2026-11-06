import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { practiceBoards, createPracticeState, practiceWon, practiceOpening } from './src/practice.js';
import { cells, moves, placement, penalty } from './src/engine.js';

const native = JSON.parse(readFileSync(new URL('./reference/practice-mode/configurations.json', import.meta.url)));
assert.equal(practiceBoards.length, 50);
assert.deepEqual(practiceBoards.map(b => b.number), Array.from({length:50},(_,i)=>i+1));
const typeMap = [3,0,1,2,4,5,6];
for (const config of practiceBoards) {
  const original = native.configurations[config.number - 1];
  const state = createPracticeState(config.number);
  assert.deepEqual(state.scores, original.startingScores);
  assert.equal(state.turn, original.unresolvedHeader.bytes5Through8[0]);
  state.hands.forEach((hand,p) => typeMap.forEach((type,nativeType) => assert.equal(hand[type],original.handsByNativeShapeId[p][nativeType])));
  const occupied = new Set();
  for (const piece of state.placed) {
    for(const id of piece.ids) {
      assert(!occupied.has(id), `Overlapping preset on board ${config.number}`);
      occupied.add(id);
      assert.equal(state.board[id],3);
    }
  }
  // Check all 168 converted cells against native shape masks and anchor tables.
  const nativeCells = new Set(original.placements.flatMap(piece => {
    const [dr,dc] = native.shapeAnchorOffsets[piece.shapeId][piece.rotation];
    return native.shapeCellOffsets[piece.shapeId][piece.rotation].map(([r,c]) => `${piece.x+dr+r},${piece.y+dc+c}`);
  }));
  cells.forEach((cell,id) => {
    const row = Math.floor(cell.p[1])+7;
    const column = Math.round(2*(cell.p[0]+cell.p[1]/2)+15);
    assert.equal(Boolean(state.board[id]),nativeCells.has(`${row},${column}`),`Native geometry mismatch on board ${config.number}`);
  });
  assert(moves(state.board,state.hands[state.turn]).length, `Board ${config.number} must be playable`);
  const opening=practiceOpening(state,moves(state.board,state.hands[state.turn]));
  if(opening) assert(placement(state.board,opening.type,opening.rot,opening.x,opening.y));
  // Play every board to termination, including passes and leftover penalties.
  for(let turn=0;turn<100;turn++) {
    const legal = moves(state.board,state.hands[state.turn]);
    if(!legal.length && !moves(state.board,state.hands[1-state.turn]).length) {
      state.over=true;
      state.scores=state.scores.map((score,p)=>score-penalty(state.hands[p]));
      break;
    }
    const move = [...legal].sort((a,b)=>b.score-a.score)[0];
    if(move) {
      move.ids.forEach(id => { assert.equal(state.board[id],0); state.board[id]=state.turn+1; });
      assert(state.hands[state.turn][move.type]>0);
      state.hands[state.turn][move.type]--;
      state.scores[state.turn]+=move.score;
    }
    state.turn=1-state.turn;
    state.turnsPlayed++;
  }
  assert(state.over, `Board ${config.number} must finish`);
  assert.equal(practiceWon(state),state.scores[0]>state.scores[1]);
  const fresh=createPracticeState(config.number);
  assert.deepEqual(fresh.scores,original.startingScores,'Retry resets scores');
  assert.equal(fresh.over,false);
}
assert(!practiceWon({...createPracticeState(1),over:true,scores:[100,100]}),'A draw does not clear a practice board');
assert.throws(()=>createPracticeState(0),RangeError);
assert.throws(()=>createPracticeState(51),RangeError);
console.log('Passed all 50 native board conversions, inventories, opening turns, complete games, retries, and win conditions.');
