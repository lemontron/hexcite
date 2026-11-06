import assert from 'node:assert/strict';
import { createDock } from './src/dock.js';

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
globalThis.DOMPoint = class {
  constructor(x, y) { this.x = x; this.y = y; }
  matrixTransform() { return this; }
};
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

const dock = new Element(), board = new Element();
const model = { type: 0, rotation: 0, moves: [], hand: [1], color: '#f00' };
const controller = createDock({
  dock, board, model: () => model, select(type) { model.type = type; }, preview() {},
  orient(value) { model.rotation = value; },
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
// Exhausted types are omitted, so child indices no longer match shape types.
controller.reset();
model.hand = [0, 1, 0, 0, 0, 1, 0];
dock.children = [1, 5].map((type, index) => {
  const item = new Element();
  item.dataset.type = String(type);
  item.getBoundingClientRect = () => ({left: index * 100, right: (index + 1) * 100});
  item.append(new Element());
  return item;
});
pointer(dock, 'pointerdown', 50, 500);
assert.equal(model.type, 1, 'First remaining dock slot selects rhombus, not exhausted triangle');
pointer(dock, 'pointerup', 50, 500);
pointer(dock, 'pointerdown', 150, 500);
assert.equal(model.type, 5, 'Second remaining dock slot selects large rhombus');
pointer(dock, 'pointerup', 150, 500);
controller.reset();
dock.children = [];
pointer(dock, 'pointerdown', 50, 500);
assert.equal(model.type, 5, 'An empty dock does not select a shape');
console.log('Passed relative panning, tap rotation, and grabbing with exhausted or empty dock slots.');
