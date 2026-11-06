import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { cells, shapes, vertices, placement } from '../src/engine.js';

const source = JSON.parse(readFileSync(new URL('../reference/practice-mode/configurations.json', import.meta.url)));
const typeMap = [3, 0, 1, 2, 4, 5, 6];
const key = points => points.map(p => p.join(',')).sort().join('|');
const cellLookup = new Map(cells.map((cell, id) => [key(cell.v), id]));
function nativeCell(row, column) {
  const t = 1 - (row + column) % 2;
  const x = (column - row - 8 - (t ? 2 : 1)) / 2, y = row - 7;
  const v = t ? [[x+1,y],[x+1,y+1],[x,y+1]] : [[x,y],[x+1,y],[x,y+1]];
  const id = cellLookup.get(key(v));
  assert.notEqual(id, undefined, `Native cell outside board: ${row},${column}`);
  return id;
}
function hull(points) {
  const sorted = [...new Map(points.map(p => [p.join(','), p])).values()].sort((a,b) => a[0]-b[0] || a[1]-b[1]);
  const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const half = list => { const out=[]; for(const p of list) { while(out.length>1 && cross(out.at(-2),out.at(-1),p)<=0) out.pop(); out.push(p); } return out; };
  return [...half(sorted).slice(0,-1), ...half([...sorted].reverse()).slice(0,-1)];
}
function convert(piece) {
  const offsets = source.shapeCellOffsets[piece.shapeId][piece.rotation];
  const [dr,dc] = source.shapeAnchorOffsets[piece.shapeId][piece.rotation];
  const ids = offsets.map(([r,c]) => nativeCell(piece.x+dr+r, piece.y+dc+c)).sort((a,b)=>a-b);
  const v = hull(ids.flatMap(id => cells[id].v));
  if(piece.shapeId === 7) return {ids, v};
  const type = typeMap[piece.shapeId];
  for(let rot=0;rot<6;rot++) for(let x=-6;x<=6;x++) for(let y=-6;y<=6;y++) {
    if(key(vertices(type,rot,x,y))===key(v)) return {type,rot,x,y,ids,v};
  }
  throw new Error(`Cannot convert ${JSON.stringify(piece)}`);
}
const boards = source.configurations.map(config => {
  const placed = config.placements.map(convert);
  assert.equal(new Set(placed.flatMap(p=>p.ids)).size, placed.reduce((n,p)=>n+p.ids.length,0), `Overlap in ${config.number}`);
  const board = Array(cells.length).fill(0);
  placed.forEach(p => p.ids.forEach(id=>board[id]=3));
  let opening = null;
  try {
    const move = convert(config.suggestedOpening);
    if (placement(board,move.type,move.rot,move.x,move.y)) opening = move;
  } catch { /* Some ROM suggestion records contain stale or unused moves. */ }
  const hands=config.handsByNativeShapeId.map(hand => { const result=Array(7).fill(0); typeMap.forEach((type,id)=>result[type]=hand[id]); return result; });
  const turn = config.unresolvedHeader.bytes5Through8[0];
  assert(turn === 0 || turn === 1);
  return {number:config.number,turn,scores:config.startingScores,hands,placed,opening};
});
writeFileSync(new URL('../src/practice-boards.json',import.meta.url),JSON.stringify(boards)+'\n');
console.log(`Converted ${boards.length} boards; verified nonoverlapping placements and usable opening geometry.`);
