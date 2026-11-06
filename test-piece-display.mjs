import assert from 'node:assert/strict';
import { createPieceDisplay } from './src/piece-display.js';

class Element {
  children = [];
  dataset = {};
  style = { setProperty(name, value) { this[name] = value; } };
  replaceChildren(...children) { this.children = children; }
  getBoundingClientRect() { throw new Error('Dock rendering must not measure the DOM'); }
}
globalThis.document = { createElement: () => new Element() };
// No ResizeObserver or animation-frame globals: all layout must be declarative.

const active = new Element(), opponent = new Element();
let selected;
const playerDock = createPieceDisplay(active, { onSelect: type => { selected = type; } });
const opponentDock = createPieceDisplay(opponent);
const snapshot = container => container.children.map(piece => ({
  type: piece.dataset.type, markup: piece.innerHTML, width: piece.style.flexBasis,
  visibility: piece.style.visibility,
}));
for (const hand of [[2, 2, 2, 1, 2, 1, 1], [0, 2, 0, 1, 0, 0, 1], [0, 0, 0, 0, 0, 0, 0]]) {
  playerDock.render({ hand, disabled: true });
  opponentDock.render({ hand });
  assert.equal(active.children.length, hand.length, 'Empty types retain their slots');
  assert.deepEqual(snapshot(active), snapshot(opponent), 'Both docks have identical geometry and labels');
  const before = snapshot(active);
  const oldNodes = [...active.children];
  playerDock.render({ hand, disabled: false });
  assert.deepEqual(snapshot(active), before, 'Turn changes do not change dock layout');
  active.children.forEach((piece, index) => {
    assert.notEqual(piece, oldNodes[index], 'Stable layout does not require retaining DOM nodes');
    assert.equal(piece.disabled, !hand[index]);
    assert.equal(piece.style.visibility, hand[index] ? 'visible' : 'hidden');
    assert.match(piece.innerHTML, /class="piece-art" style="aspect-ratio:/);
    assert.match(piece.innerHTML, /class="count" style="left:[\d.]+%;top:[\d.]+%"/);
    assert.equal(opponent.children[index].onclick, undefined);
    const previousSelection = selected;
    piece.onclick({detail: 0});
    assert.equal(selected, hand[index] ? piece.dataset.type : previousSelection);
  });
}
const hand = [2, 2, 2, 1, 2, 1, 1];
playerDock.render({hand});
const fullDock = snapshot(active);
playerDock.render({hand: [1, 0, 2, 1, 2, 1, 1]});
assert.deepEqual(active.children.map(piece => piece.dataset.type), [0, 1, 2, 3, 4, 5, 6]);
assert.equal(active.children[1].style.visibility, 'hidden', 'Exhausted slot is invisible');
assert.equal(active.children[1].style.flexBasis, fullDock[1].width, 'Exhausted slot keeps its width');
assert.match(active.children[0].innerHTML, /class="count"[^>]*>1<\/span>/);
assert.equal(active.children[0].style.flexBasis, fullDock[0].width, 'Exhausting a type does not enlarge other pieces');
assert.equal(active.children[2].innerHTML, fullDock[2].markup, 'Exhausting a neighbor does not change shape or label geometry');
playerDock.render({hand});
assert.deepEqual(snapshot(active), fullDock, 'Replay restores the same layout');
console.log('Passed deterministic dock redraws, fixed label anchors, counts, turn changes, exhaustion, and replay.');
