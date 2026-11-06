import assert from 'node:assert/strict';
import { createPieceDisplay } from './src/piece-display.js';

class Element {
  children = [];
  dataset = {};
  attributes = {};
  style = { setProperty(name, value) { this[name] = value; } };
  parentNode = null;
  htmlWrites = 0;
  set innerHTML(value) {
    this.htmlWrites++;
    this.markup = value;
    this.label = {textContent: value.match(/class="count">([^<]+)/)[1], style: {}};
  }
  get innerHTML() { return this.markup.replace(/(class="count">)[^<]+/, `$1${this.label.textContent}`); }
  querySelector() { return this.label; }
  get firstChild() { return this.children[0] ?? null; }
  get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] ?? null; }
  insertBefore(item, next) {
    item.remove();
    const index = next ? this.children.indexOf(next) : this.children.length;
    this.children.splice(index, 0, item);
    item.parentNode = this;
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = null;
  }
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
  playerDock.render({ hand, disabled: true });
  opponentDock.render({ hand });
  assert.equal(active.children.length, hand.filter(Boolean).length);
  assert.equal(active.children.length, opponent.children.length);
  active.children.forEach((piece, index) => {
    const other = opponent.children[index];
    assert.equal(piece.innerHTML, other.innerHTML, 'Both docks render identical shapes and counts');
    assert.equal(piece.style.flexBasis, other.style.flexBasis, 'Both docks use identical sizing');
    assert.equal(piece.disabled, true);
    assert.equal(other.onclick, undefined, 'Opponent dock is display only');
    piece.onclick({ detail: 0 });
    assert.equal(selected, piece.dataset.type);
  });
}
// Turn changes and scoring updates must retain SVGs and positioned count labels.
const hand = [2, 2, 2, 1, 2, 1, 1];
playerDock.render({hand, disabled: true});
const original = [...active.children];
original.forEach(piece => { piece.label.style.left = '12px'; });
playerDock.render({hand, disabled: false});
active.children.forEach((piece, index) => {
  assert.equal(piece, original[index], 'Changing turns preserves the piece element');
  assert.equal(piece.htmlWrites, 1, 'The shape and count markup is created only once');
  assert.equal(piece.label.style.left, '12px', 'Count positioning does not reset');
  assert.equal(piece.disabled, false);
});
playerDock.render({hand: [1, 2, 2, 1, 2, 1, 1]});
assert.equal(active.children[0], original[0], 'Updating a count preserves the shape');
assert.equal(active.children[0].label.textContent, '1');
playerDock.render({hand: [1, 0, 2, 1, 2, 1, 1]});
assert.equal(active.children[1], original[2], 'Exhausting one type preserves the other pieces');
playerDock.render({hand});
active.children.forEach((piece, index) => assert.equal(piece, original[index], 'Replay restores the original shape order'));
console.log('Passed matching docks, stable piece elements, count updates, turn changes, exhaustion, and replay.');
