import assert from 'node:assert/strict';
import { practiceBoards, createPracticeState, practiceWon, practiceOpening } from './src/practice.js';
import { cells, moves, placement, penalty } from './src/engine.js';

assert.equal(practiceBoards.length, 50);
assert.deepEqual(practiceBoards.map(b => b.number), Array.from({length:50},(_,i)=>i+1));
for (const config of practiceBoards) {
  const state = createPracticeState(config.number);
  assert.deepEqual(state.scores, config.scores);
  assert.equal(state.turn, config.turn);
  assert.deepEqual(state.hands, config.hands);
  assert([0,1].includes(state.turn));
  state.hands.forEach(hand => {
    assert.equal(hand.length,7);
    assert(hand.every(count => Number.isInteger(count) && count >= 0));
  });
  const occupied = new Set();
  for (const piece of state.placed) {
    for(const id of piece.ids) {
      assert(!occupied.has(id), `Overlapping preset on board ${config.number}`);
      occupied.add(id);
      assert.equal(state.board[id],3);
    }
  }
  // Validate shipped geometry without depending on optional ROM research files.
  for (const piece of state.placed) {
    const covered = cells.flatMap((cell,id) => {
      const sides = piece.v.map((a,i) => {
        const b = piece.v[(i+1)%piece.v.length];
        return (b[0]-a[0])*(cell.p[1]-a[1])-(b[1]-a[1])*(cell.p[0]-a[0]);
      });
      return sides.every(n=>n>=-1e-6) || sides.every(n=>n<=1e-6) ? [id] : [];
    });
    assert.deepEqual(covered,[...piece.ids].sort((a,b)=>a-b),`Geometry mismatch on board ${config.number}`);
  }
  assert.equal(state.board.filter(Boolean).length,occupied.size);
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
  assert.deepEqual(fresh.scores,config.scores,'Retry resets scores');
  assert.deepEqual(fresh.hands,config.hands,'Retry resets inventories');
  assert.equal(fresh.turn,config.turn,'Retry resets starting player');
  assert.equal(fresh.over,false);
}
assert.deepEqual(createPracticeState(1).scores,[100,130]);
assert.deepEqual(createPracticeState(50).scores,[100,25]);
assert.equal(createPracticeState(50).turn,1);
assert(!practiceWon({...createPracticeState(1),over:true,scores:[100,100]}),'A draw does not clear a practice board');
assert.throws(()=>createPracticeState(0),RangeError);
assert.throws(()=>createPracticeState(51),RangeError);
console.log('Passed all 50 practice board geometries, inventories, opening turns, complete games, retries, and win conditions.');
