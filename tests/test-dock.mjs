import assert from 'node:assert/strict';
import { createDock } from '../src/dock.js';

class Element {
  children = [];
  listeners = {};
  attributes = {};
  dataset = {};
  style = { setProperty() {} };
  classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  append(child) { this.children.push(child); }
  querySelector() { return this.children[0]; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  setPointerCapture() {}
  getScreenCTM() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; }
  getBoundingClientRect() { return { left: -1000, right: 1000, top: -1000, bottom: 1000 }; }
}

let overlay;
globalThis.document = {
  createElementNS: () => new Element(),
  body: { append(element) { overlay = element; } },
};
globalThis.window = new Element();
let frames = new Map(), nextFrame = 0, time = performance.now();
globalThis.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
globalThis.cancelAnimationFrame = id => frames.delete(id);
function settle() {
  for (let i = 0; frames.size && i < 100; i++) {
    const pending = [...frames.values()];
    frames.clear();
    time += 40;
    pending.forEach(callback => callback(time));
  }
  assert.equal(frames.size, 0, 'Animation settles');
}

const dock = new Element(), otherDock = new Element(), board = new Element();
const model = { player: 0, type: 0, rotation: 0, moves: [], hand: [1], color: '#f00' };
const selections = [];
let reserved = null;
const controller = createDock({
  docks: [dock, otherDock], board, model: () => model, select(type) { model.type = type; selections.push(type); }, preview() {},
  orient(value) { model.rotation = value; },
  reserve(type) { reserved = type; },
});
const piece = overlay.children[0];
function center() {
  const points = piece.attributes.points.split(' ').map(p => p.split(',').map(Number));
  return [0, 1].map(axis => (Math.min(...points.map(p => p[axis])) + Math.max(...points.map(p => p[axis]))) / 2);
}
function pointer(target, type, x, y) {
  target.listeners[type]({ pointerId: 1, pointerType: 'touch', clientX: x, clientY: y, type, preventDefault() {} });
}
function near(actual, expected) {
  actual.forEach((value, i) => assert(Math.abs(value - expected[i]) < .25, `${actual} should equal ${expected}`));
}

controller.showMove({ v: [[0, 0], [1, 0], [0, 1]] });
assert.equal(reserved, 0, 'Showing a piece reserves one from its dock');
settle();
let origin = center();
// Grab far from the piece: touching down alone must not move it.
pointer(board, 'pointerdown', 300, 350);
settle();
near(center(), origin);
pointer(board, 'pointermove', 340, 325);
settle();
near(center(), [origin[0] + 40, origin[1] - 25]);
pointer(board, 'pointerup', 340, 325);

// A new gesture starts at the current piece position with a new finger anchor.
origin = center();
pointer(board, 'pointerdown', -200, 150);
pointer(board, 'pointermove', -215, 180);
settle();
near(center(), [origin[0] - 15, origin[1] + 30]);
pointer(board, 'pointerup', -215, 180);

// Tapping anywhere on the board rotates in place.
origin = center();
pointer(board, 'pointerdown', 400, 400);
pointer(board, 'pointerup', 400, 400);
settle();
assert.equal(model.rotation, 1);
near(center(), origin);

// Grabbing the floating polygon also uses relative movement.
pointer(piece, 'pointerdown', origin[0], origin[1]);
settle();
near(center(), origin);
pointer(overlay, 'pointermove', origin[0] + 20, origin[1] + 10);
settle();
near(center(), [origin[0] + 20, origin[1] + 10]);
pointer(overlay, 'pointerup', origin[0] + 20, origin[1] + 10);
// Exhausted types retain their slots and cannot be selected.
controller.reset();
assert.equal(reserved, null, 'Reset returns the held piece to the dock');
model.hand = [0, 1, 0, 0, 0, 1, 0];
dock.children = Array.from({length: 7}, (_, type) => {
  const item = new Element();
  item.dataset.type = String(type);
  item.getBoundingClientRect = () => ({left: type * 100, right: (type + 1) * 100});
  item.append(new Element());
  return item;
});
pointer(dock, 'pointerdown', 50, 500);
assert.equal(model.type, 0, 'An exhausted slot does not select a shape');
pointer(dock, 'pointerdown', 150, 500);
assert.equal(model.type, 1, 'Rhombus stays in its original slot');
assert.equal(reserved, 1, 'Pickup reserves its type');
pointer(dock, 'pointerup', 150, 500);
pointer(dock, 'pointerdown', 550, 500);
assert.equal(model.type, 5, 'Large rhombus stays in its original slot');
assert.equal(reserved, 5, 'Switching pieces transfers the reservation');
pointer(dock, 'pointerup', 550, 500);
controller.reset();
dock.children = [];
pointer(dock, 'pointerdown', 50, 500);
assert.equal(model.type, 5, 'An empty dock does not select a shape');
// Each player's dock stays in place; only the current player can pull a piece.
controller.reset();
board.getBoundingClientRect = () => ({left: 0, right: 400, top: 100, bottom: 500});
for (const [container, top] of [[dock, 0], [otherDock, 550]]) {
  container.getBoundingClientRect = () => ({left: 0, right: 400, top, bottom: top + 64});
  const item = new Element();
  item.dataset.type = '0';
  item.getBoundingClientRect = () => ({left: 100, right: 120, top, bottom: top + 64});
  const shape = new Element();
  shape.getBoundingClientRect = () => ({left: 100, top: top + 20, width: 20, height: 20});
  item.append(shape);
  container.children = [item];
}
model.hand = [1];
model.player = 0;
let selectedCount = selections.length;
pointer(otherDock, 'pointerdown', 110, 582);
assert.equal(selections.length, selectedCount, '1P cannot pick from 2P dock');
pointer(dock, 'pointerdown', 110, 32);
pointer(dock, 'pointermove', 110, 180);
settle();
near(center(), [110, 270]);
pointer(dock, 'pointerup', 110, 180);

controller.reset();
model.player = 1;
selectedCount = selections.length;
pointer(dock, 'pointerdown', 110, 32);
assert.equal(selections.length, selectedCount, '2P cannot pick from 1P dock');
pointer(otherDock, 'pointerdown', 110, 582);
pointer(otherDock, 'pointermove', 110, 450);
settle();
near(center(), [110, 360]);
pointer(otherDock, 'pointerup', 110, 450);
assert.equal(selections.length, selectedCount + 1, '2P can pick from its own dock');

controller.reset();
model.busy = true;
selectedCount = selections.length;
pointer(otherDock, 'pointerdown', 110, 582);
assert.equal(selections.length, selectedCount, 'No grabs during computer moves or scoring');
console.log('Passed relative panning, rotation, empty slots, fixed player docks, turn restrictions, and both pull directions.');
