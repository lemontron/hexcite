import assert from 'node:assert/strict';
import { createPieceDisplay } from '../src/piece-display.js';

class Element {
  children = [];
  dataset = {};
  attributes = {};
  classList = { add() {} };
  style = { setProperty(name, value) { this[name] = value; } };
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  getBoundingClientRect() { throw new Error('Dock rendering must not measure the DOM'); }
}
globalThis.document = { createElementNS: () => new Element() };
globalThis.innerWidth = 390;
globalThis.innerHeight = 844;
let landscape = false;
globalThis.matchMedia = () => ({matches: landscape});

const active = new Element(), opponent = new Element();
active.parentElement = opponent.parentElement = {clientWidth: 370, clientHeight: 64};
let selected;
const playerDock = createPieceDisplay(active, {onSelect: type => { selected = type; }});
const opponentDock = createPieceDisplay(opponent);
const snapshot = strip => strip.children.map(piece => ({
  type: piece.dataset.type,
  position: piece.getAttribute('transform'),
  points: piece.children[0].getAttribute('points'),
  count: piece.children[1].textContent,
  visibility: piece.style.visibility,
}));
playerDock.fit(39);
opponentDock.fit(39);
const row = active.children.map(piece => piece.getAttribute('transform'));
const rowViewBox = active.getAttribute('viewBox');
assert(Number(active.getAttribute('width')) > Number(active.getAttribute('height')));
for (const hand of [[2, 2, 2, 1, 2, 1, 1], [0, 2, 0, 1, 0, 0, 1], [0, 0, 0, 0, 0, 0, 0]]) {
  playerDock.render({hand, disabled: true});
  opponentDock.render({hand});
  assert.equal(active.children.length, hand.length, 'Empty types retain their slots');
  assert.deepEqual(snapshot(active), snapshot(opponent), 'Both docks have identical geometry and labels');
  const before = snapshot(active);
  const oldNodes = [...active.children];
  playerDock.render({hand, disabled: false});
  assert.deepEqual(snapshot(active), before, 'Turn changes do not change dock layout');
  active.children.forEach((piece, index) => {
    assert.equal(piece, oldNodes[index], 'Turn changes reuse the same slots');
    assert.equal(piece.getAttribute('aria-disabled'), String(!hand[index]));
    assert.equal(piece.getAttribute('tabindex'), hand[index] ? '0' : '-1');
    assert.equal(piece.style.visibility, hand[index] ? 'visible' : 'hidden');
    assert.equal(piece.children[1].textContent, String(hand[index]));
    assert.equal(opponent.children[index].onclick, undefined);
    const previousSelection = selected;
    piece.onclick({detail: 0});
    assert.equal(selected, hand[index] ? index : previousSelection);
  });
}
const hand = [2, 2, 2, 1, 2, 1, 1];
playerDock.render({hand});
const fullDock = snapshot(active);
playerDock.render({hand: [1, 0, 2, 1, 2, 1, 1]});
assert.deepEqual(active.children.map(piece => piece.dataset.type), [0, 1, 2, 3, 4, 5, 6]);
assert.equal(active.children[1].style.visibility, 'hidden', 'Exhausted slot is invisible');
assert.deepEqual(active.children.map(piece => piece.getAttribute('transform')), row, 'Exhausting a type leaves every slot in place');
assert.equal(active.children[0].children[1].textContent, '1');
playerDock.render({hand});
assert.deepEqual(snapshot(active), fullDock, 'Replay restores the same layout');

selected = undefined;
active.children[2].onkeydown({key: ' ', preventDefault() {}});
assert.equal(selected, 2, 'Keyboard activation selects the focused piece');

const width = Number(active.getAttribute('width'));
active.parentElement = {clientWidth: 180, clientHeight: 64};
playerDock.fit(39);
assert.equal(active.getAttribute('viewBox'), rowViewBox, 'Resizing keeps the same canonical row');
assert.deepEqual(active.children.map(piece => piece.getAttribute('transform')), row);
assert(Number(active.getAttribute('width')) < width, 'The whole row scales to fit');
landscape = true;
active.parentElement = {clientWidth: 120, clientHeight: 320};
playerDock.fit(39);
assert.notEqual(active.getAttribute('viewBox'), rowViewBox);
assert(Number(active.getAttribute('height')) > Number(active.getAttribute('width')));
console.log('Passed fixed SVG layouts, stable empty slots, count updates, and keyboard selection.');
