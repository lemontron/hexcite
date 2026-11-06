import assert from 'node:assert/strict';
import { createPieceDisplay } from './src/piece-display.js';

class Element {
  children = [];
  dataset = {};
  attributes = {};
  style = { setProperty(name, value) { this[name] = value; } };
  replaceChildren() { this.children = []; }
  append(item) { this.children.push(item); }
  setAttribute(name, value) { this.attributes[name] = value; }
}
globalThis.document = { createElement: () => new Element() };
globalThis.ResizeObserver = class { observe() {} };
globalThis.requestAnimationFrame = () => 1;

const active = new Element(), opponent = new Element();
let selected;
const playerDock = createPieceDisplay(active, { onSelect: type => { selected = type; } });
const opponentDock = createPieceDisplay(opponent);
for (const hand of [[2, 2, 2, 1, 2, 1, 1], [0, 2, 0, 1, 0, 0, 1], [0, 0, 0, 0, 0, 0, 0]]) {
  playerDock.render({ hand, selected: 3, disabled: true });
  opponentDock.render({ hand });
  assert.equal(active.children.length, hand.filter(Boolean).length);
  assert.equal(active.children.length, opponent.children.length);
  active.children.forEach((piece, index) => {
    const other = opponent.children[index];
    assert.equal(piece.innerHTML, other.innerHTML, 'Both docks render identical shapes and counts');
    assert.equal(piece.style.flexBasis, other.style.flexBasis, 'Both docks use identical sizing');
    assert.equal(piece.attributes['aria-label'], other.attributes['aria-label']);
    assert.equal(piece.disabled, true);
    assert.equal(other.onclick, undefined, 'Opponent dock is display only');
    piece.onclick({ detail: 0 });
    assert.equal(selected, piece.dataset.type);
  });
}
console.log('Passed matching dock geometry, counts, sizing, empty hands, and interaction modes.');
