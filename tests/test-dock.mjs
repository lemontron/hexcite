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
  querySelectorAll() { return this.children; }
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

const dock = new Element(), otherDock = new Element(), board = new Element(), gameScreen = new Element();
const boardCells = new Element();
boardCells.getBoundingClientRect = () => board.getBoundingClientRect();
board.append(boardCells);
const model = { player: 0, type: 0, rotation: 0, moves: [], hand: [1], color: '#f00' };
const selections = [];
let reserved = null;
const controller = createDock({
  docks: [dock, otherDock], board, gameScreen, model: () => model, select(type) { model.type = type; selections.push(type); }, preview() {},
  orient(value) { model.rotation = value; },
  reserve(type) { reserved = type; },
});
const [piece] = overlay.children;
function center() {
  const points = piece.attributes.points.split(' ').map(p => p.split(',').map(Number));
  return [0, 1].map(axis => (Math.min(...points.map(p => p[axis])) + Math.max(...points.map(p => p[axis]))) / 2);
}
function pointer(target, type, x, y, hit = null) {
  target.listeners[type]({ pointerId: 1, pointerType: 'touch', clientX: x, clientY: y, type, currentTarget: target, target: { closest: () => hit }, preventDefault() {} });
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

origin = center();
pointer(gameScreen, 'pointerdown', 300, 350);
pointer(gameScreen, 'pointermove', 330, 355);
pointer(gameScreen, 'pointerup', 330, 355);
settle();
near(center(), [origin[0] + 30, origin[1] + 5]);
pointer(gameScreen, 'pointerdown', 300, 350);
pointer(gameScreen, 'pointerup', 300, 350);
assert.equal(model.rotation, 0, 'A background tap does not rotate the piece');
origin = center();
pointer(gameScreen, 'pointerdown', 300, 350, {});
pointer(gameScreen, 'pointermove', 330, 355);
pointer(gameScreen, 'pointerup', 330, 355);
settle();
near(center(), origin);

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
  const shape = new Element();
  shape.getBoundingClientRect = item.getBoundingClientRect;
  item.append(shape);
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
// Landscape docks select along Y and pull horizontally toward the board.
model.busy = false;
model.hand = [1, 1];
board.getBoundingClientRect = () => ({left: 100, right: 500, top: 0, bottom: 300});
for (const [player, left, startX, endX, expectedX] of [[0, 0, 50, 180, 270], [1, 500, 550, 420, 330]]) {
  controller.reset();
  model.player = player;
  const container = [dock, otherDock][player];
  container.getBoundingClientRect = () => ({left, right: left + 100, top: 0, bottom: 300});
  container.children = [0, 1].map(type => {
    const item = new Element();
    item.dataset.type = String(type);
    item.getBoundingClientRect = () => ({left, right: left + 100, top: 150 * type, bottom: 150 * (type + 1)});
    const shape = new Element();
    shape.getBoundingClientRect = () => ({
      left: left + 40, right: left + 60, top: 150 * type + 50, bottom: 150 * type + 70, width: 20, height: 20,
    });
    item.append(shape);
    return item;
  });
  pointer(container, 'pointerdown', startX, 80);
  assert.equal(reserved, 0);
  pointer(container, 'pointermove', startX, 220);
  assert.equal(reserved, 1, 'Moving vertically within the dock switches slots');
  pointer(container, 'pointermove', endX, 220);
  settle();
  near(center(), [expectedX, 220]);
  pointer(container, 'pointerup', endX, 220);
}

// A boardward diagonal can cross a neighboring slot before leaving the dock.
for (const sideBySide of [false, true]) {
  controller.reset();
  model.player = 0;
  const point = (across, along) => sideBySide ? [along, across] : [across, along];
  const rect = (across, along, acrossSize, alongSize) => {
    const [left, top] = point(across, along);
    const [width, height] = point(acrossSize, alongSize);
    return {left, top, width, height, right: left + width, bottom: top + height};
  };
  board.getBoundingClientRect = () => rect(0, 70, 400, 400);
  boardCells.getBoundingClientRect = () => rect(10, 80, 380, 380);
  dock.getBoundingClientRect = () => rect(0, 0, 400, 64);
  dock.children = [0, 1].map(type => {
    const item = new Element();
    item.dataset.type = String(type);
    item.getBoundingClientRect = () => rect(90 + 30 * type, 22, 20, 20);
    const shape = new Element();
    shape.getBoundingClientRect = item.getBoundingClientRect;
    item.append(shape);
    return item;
  });
  pointer(dock, 'pointerdown', ...point(109, 24));
  pointer(dock, 'pointermove', ...point(140, 64));
  assert.equal(reserved, 0, 'Aiming at the board keeps the held piece across a slot boundary');
  pointer(dock, 'pointermove', ...point(140, 80));
  assert.equal(reserved, 0, 'Reaching the board edge keeps the held piece');
  pointer(dock, 'pointerup', ...point(140, 80));
  pointer(dock, 'pointerdown', ...point(109, 24));
  pointer(dock, 'pointermove', ...point(130, 24));
  assert.equal(reserved, 1, 'Moving along the dock can still switch pieces');
  pointer(dock, 'pointercancel', ...point(130, 24));
}
console.log('Passed panning, rotation, dock slots, turn restrictions, and boardward drag intent in both layouts.');
