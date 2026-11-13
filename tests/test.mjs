import assert from 'node:assert/strict';import{cells,regions,shapes,moves,placement,penalty}from'../src/engine.js';
import {dealStartingHands} from '../src/starting-hands.js';

// Repeated draws from the same end still consume distinct packets.
assert.deepEqual(dealStartingHands(() => 0), [
  [4, 3, 3, 2, 2, 2, 2],
  [2, 2, 3, 5, 4, 2, 0],
]);
// The four bonus packets give each player four random picks, counted in their 18.
const bonusRolls = [.999, .999, .999, .999, 0, 0, 0, 0, .999, .999, .999, .999];
assert.deepEqual(dealStartingHands(() => bonusRolls.shift()), [
  [6, 2, 2, 1, 2, 2, 3],
  [2, 2, 2, 3, 2, 0, 7],
]);
// On the opening turn, only full-side contact with the center boundary counts.
const emptyBoard = Array(cells.length).fill(0);
assert.equal(placement(emptyBoard, 0, 0, 0, 0), null, 'Interior opening triangle is illegal');
assert.equal(placement(emptyBoard, 3, 0, 0, 0), null, 'Centered opening hexagon is illegal');
assert.equal(placement(emptyBoard, 0, 0, -2, 0).score, 5, 'One boundary side earns 5 points');
assert.equal(placement(emptyBoard, 3, 0, -1, 0).score, 10, 'Two boundary sides earn 10 points');
assert.equal(placement(emptyBoard, 6, 0, -2, 0).score, 15, 'Three boundary sides earn 15 points');
assert.deepEqual(placement(emptyBoard, 0, 0, -2, 0).completedRegions, [], 'Opening has no completed bonus regions');
const afterOpening = [...emptyBoard];
placement(emptyBoard, 0, 0, -2, 0).ids.forEach(id => afterOpening[id] = 1);
assert.equal(placement(afterOpening, 0, 0, 0, -2), null, 'Boundary alone does not allow later moves');
assert.equal(cells.length,168);regions.forEach(r=>assert.equal(r.length,24));let board=Array(168).fill(0),hand=[2,2,2,1,2,1,1],ms=moves(board,hand);assert(ms.length);ms.forEach(m=>assert(m.ids.every(i=>cells[i].r===0)));let opening=ms.find(m=>m.type===3);opening.ids.forEach(i=>board[i]=1);assert.equal(placement(board,opening.type,opening.rot,opening.x,opening.y),null);assert(moves(board,hand).length);assert.equal(penalty([1,0,0,1,0,0,0]),45);
let placements=0;for(let game=0;game<5;game++){board=Array(168).fill(0);let hands=[[2,2,2,1,2,1,1],[2,2,2,1,2,1,1]],turn=0,pass=0;for(let t=0;t<60;t++){let options=moves(board,hands[turn]);if(!options.length){if(++pass===2)break;turn=1-turn;continue}pass=0;let m=options[Math.floor(Math.random()*options.length)];assert(m.ids.every(i=>!board[i]));m.ids.forEach(i=>board[i]=turn+1);hands[turn][m.type]--;assert(hands[turn].every(n=>n>=0));turn=1-turn;placements++}}
// A final triangle earns the marked completion bonus for each outer region.
for (const [region, bonus] of [[0, 0], [1, 30], [2, 10], [3, 30], [4, 10], [5, 30], [6, 10]]) {
  const almostFull = Array(cells.length).fill(1);
  almostFull[regions[region][0]] = 0;
  const finishingMoves = moves(almostFull, [1, 0, 0, 0, 0, 0, 0]);
  assert(finishingMoves.length, `Region ${region} must have a finishing move`);
  for (const move of finishingMoves) {
    assert.equal(move.bonus, bonus, `Region ${region} completion bonus`);
    assert.deepEqual(move.completedRegions, region ? [{region, points: bonus}] : [], 'Only newly completed bonus regions are returned');
    assert(move.score > bonus, 'Completion bonus is added to contact points');
  }
}
// One rhombus completes two neighboring bonus regions in the same placement.
const twoRegions = Array(cells.length).fill(1);
twoRegions[23] = twoRegions[24] = 0;
const doubleBonus = placement(twoRegions, 1, 0, -4, 3);
assert.deepEqual(doubleBonus.completedRegions, [{region: 2, points: 10}, {region: 3, points: 30}]);
assert.equal(doubleBonus.bonus, 40);
console.log(`Passed geometry, opening, overlap, penalty, all seven region bonuses, and ${placements} simulated legal placements.`);
