import { shapes, vertices, xy } from './engine.js';

const bounds = points => {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
};

export function createDock({ dock, board, model, select, orient, preview, reducedMotion }) {
  const ns = 'http://www.w3.org/2000/svg';
  const overlay = document.createElementNS(ns, 'svg');
  overlay.classList.add('floating-piece');
  overlay.setAttribute('aria-hidden', 'true');
  const polygon = document.createElementNS(ns, 'polygon');
  overlay.append(polygon);
  document.body.append(overlay);
  let gesture = null, floating = false, slot = null, frame = 0, lastTime = 0;
  let position = { x: 0, y: 0, scale: 1 }, goal = { ...position };
  let currentPoints = [], desiredPoints = [];
  let pointer = null;

  function enabled() { const m = model(); return !m.busy && !m.over && !m.hidden; }
  function screenPoints(v) {
    const matrix = board.getScreenCTM();
    return v.map(p => { const [x, y] = xy(p); const q = new DOMPoint(x * 39, y * 39).matrixTransform(matrix); return [q.x, q.y]; });
  }
  function boardScale() { const m = board.getScreenCTM(); return Math.hypot(m.a, m.b) * 39; }
  function shapePoints() {
    const m = model(), points = vertices(m.type, m.rotation, 0, 0).map(xy), center = bounds(points);
    desiredPoints = points.map(p => [p[0] - center.x, p[1] - center.y]);
    if (currentPoints.length !== desiredPoints.length) currentPoints = desiredPoints.map(p => [...p]);
    polygon.style.fill = m.color;
    polygon.style.setProperty('--piece-color', m.color);
  }
  function wake() { if (!frame) { lastTime = performance.now(); frame = requestAnimationFrame(animate); } }
  function animate(time) {
    const alpha = reducedMotion() ? 1 : 1 - Math.exp(-Math.min(time - lastTime, 40) / 42);
    lastTime = time;
    let error = 0;
    for (const k of ['x', 'y', 'scale']) { position[k] += (goal[k] - position[k]) * alpha; error += Math.abs(goal[k] - position[k]); }
    currentPoints.forEach((p, i) => p.forEach((_, j) => { p[j] += (desiredPoints[i][j] - p[j]) * alpha; error += Math.abs(desiredPoints[i][j] - p[j]); }));
    polygon.setAttribute('points', currentPoints.map(p => [position.x + p[0] * position.scale, position.y + p[1] * position.scale].join(',')).join(' '));
    frame = 0;
    if (error > .02) frame = requestAnimationFrame(animate);
  }
  function setSlot(move) {
    slot = move;
    overlay.classList.toggle('legal', !!move);
    preview(move);
  }
  function follow(x, y) {
    pointer = { x, y };
    const desired = { x, y: y - 90 };
    const m = model();
    let best = null, nearest = Infinity;
    const candidates = m.moves.filter(move => move.type === m.type && move.rot === m.rotation);
    for (const move of candidates) {
      const center = bounds(screenPoints(move.v));
      const distance = Math.hypot(center.x - desired.x, center.y - desired.y);
      const threshold = Math.max(22, boardScale() * .72);
      const same = slot && move.x === slot.x && move.y === slot.y && move.rot === slot.rot;
      if (distance < threshold * (same ? 1.35 : 1) && distance - (same ? 9 : 0) < nearest) {
        nearest = distance - (same ? 9 : 0);
        best = move;
      }
    }
    const rect = board.getBoundingClientRect();
    if (desired.y < rect.top || desired.y > rect.bottom || x < rect.left || x > rect.right) best = null;
    const center = best ? bounds(screenPoints(best.v)) : desired;
    goal = { ...center, scale: boardScale() };
    setSlot(best);
    shapePoints();
    wake();
  }
  function magnify(x) {
    for (const item of dock.children) {
      // Layout centers do not include the animated transform.
      const center = dock.getBoundingClientRect().left + item.offsetLeft + item.offsetWidth / 2;
      const proximity = Math.max(0, 1 - Math.abs(x - center) / 90);
      item.style.setProperty('--dock-zoom', 1 + proximity * .65);
      item.style.setProperty('--dock-lift', `${-proximity * 25}px`);
    }
  }
  function clearMagnify() {
    for (const item of dock.children) { item.style.removeProperty('--dock-zoom'); item.style.removeProperty('--dock-lift'); item.classList.remove('docked-source'); }
  }
  function dockType(x) {
    const rect = dock.getBoundingClientRect();
    return Math.max(0, Math.min(shapes.length - 1, Math.floor((x - rect.left) / rect.width * shapes.length)));
  }
  function pick(type, x, y, initial) {
    if (!model().hand[type]) return;
    if (type !== model().type || !floating) select(type);
    floating = true;
    overlay.classList.add('visible');
    shapePoints();
    if (initial) {
      const rect = dock.children[type].getBoundingClientRect();
      position = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, scale: rect.width / 4.4 };
      currentPoints = desiredPoints.map(p => [...p]);
    }
    clearMagnify();
    dock.children[type]?.classList.add('docked-source');
    magnify(x);
    setSlot(null);
    pointer = { x, y };
    goal = { x, y: y - 90, scale: boardScale() };
    wake();
  }
  function down(event, source) {
    if (!enabled() || gesture || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (source === 'board' && !floating) return;
    if (source === 'dock' && !model().hand[dockType(event.clientX)]) return;
    event.preventDefault();
    const target = source === 'dock' ? dock : source === 'float' ? overlay : board;
    target.setPointerCapture(event.pointerId);
    gesture = { id: event.pointerId, source, startX: event.clientX, startY: event.clientY, moved: false, detached: source !== 'dock' };
    if (source === 'dock') pick(dockType(event.clientX), event.clientX, event.clientY, !floating);
    if (source === 'float') follow(event.clientX, event.clientY);
  }
  function move(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    event.preventDefault();
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 6) gesture.moved = true;
    if (gesture.source === 'dock' && !gesture.detached) {
      if (event.clientY < dock.getBoundingClientRect().top - 25) {
        gesture.detached = true;
        clearMagnify();
      } else {
        pick(dockType(event.clientX), event.clientX, event.clientY, false);
        return;
      }
    }
    if (gesture.moved || gesture.source === 'float') follow(event.clientX, event.clientY);
  }
  function up(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const done = gesture;
    gesture = null;
    clearMagnify();
    if (event.type === 'pointercancel') return;
    if (!done.moved && done.source !== 'dock') { rotate(); return; }

  }
  function rotate() {
    if (!enabled() || !floating) return;
    orient((model().rotation + 1) % 6);
    shapePoints();
    if (pointer) follow(pointer.x, pointer.y);
    else follow(goal.x, goal.y + 90);
  }
  function showMove(move) {
    floating = true;
    pointer = null;
    shapePoints();
    goal = { ...bounds(screenPoints(move.v)), scale: boardScale() };
    if (!overlay.classList.contains('visible')) position = { ...goal };
    overlay.classList.add('visible');
    setSlot(move);
    wake();
  }
  function reset() {
    gesture = null;
    floating = false;
    pointer = null;
    slot = null;
    overlay.classList.remove('visible', 'legal');
    clearMagnify();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }
  dock.addEventListener('pointerdown', e => down(e, 'dock'));
  board.addEventListener('pointerdown', e => down(e, 'board'));
  polygon.addEventListener('pointerdown', e => down(e, 'float'));
  for (const target of [dock, board, overlay]) {
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
    target.addEventListener('lostpointercapture', e => { if (gesture?.id === e.pointerId) { gesture = null; clearMagnify(); } });
  }
  window.addEventListener('resize', () => { if (floating) { if (pointer) follow(pointer.x, pointer.y); else if (slot) showMove(slot); } });
  return { reset, rotate, showMove };
}
