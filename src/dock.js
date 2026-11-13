import { vertices } from './engine.js';
import { xy, bounds } from './geometry.js';
import { boardPoint, screenPoint, screenScale } from './board-coordinates.js';
import { svg, polygonPoints } from './svg.js';

export function createDock({ docks, board, gameScreen, model, select, orient, preview, reserve = () => {} }) {
  const overlay = svg('svg', {class: 'floating-piece', 'aria-hidden': 'true'});
  const polygon = svg('polygon');
  overlay.append(polygon);
  document.body.append(overlay);
  let gesture = null, floating = false, slot = null, frame = 0, lastTime = 0;
  let position = { x: 0, y: 0, scale: 1 }, goal = { ...position };
  let currentPoints = [], desiredPoints = [];
  let pointer = null;
  let reservedType = null;

  function reservePiece(type) {
    if (reservedType === type) return;
    reservedType = type;
    reserve(type);
  }

  function enabled() { const m = model(); return !m.busy && !m.over && !m.hidden; }
  function moveCenter(move, matrix) {
    return bounds(move.v.map(vertex => {
      const {x, y} = screenPoint(boardPoint(vertex), matrix);
      return [x, y];
    }));
  }
  function shapePoints() {
    const m = model(), points = vertices(m.type, m.rotation, 0, 0).map(xy), center = bounds(points);
    desiredPoints = points.map(p => [p[0] - center.x, p[1] - center.y]);
    if (currentPoints.length !== desiredPoints.length) currentPoints = desiredPoints.map(p => [...p]);
    polygon.style.fill = m.color;
    polygon.style.setProperty('--piece-color', m.color);
  }
  function wake() { if (!frame) { lastTime = performance.now(); frame = requestAnimationFrame(animate); } }
  function animate(time) {
    const alpha = 1 - Math.exp(-Math.min(time - lastTime, 40) / 42);
    lastTime = time;
    let error = 0;
    for (const k of ['x', 'y', 'scale']) { position[k] += (goal[k] - position[k]) * alpha; error += Math.abs(goal[k] - position[k]); }
    currentPoints.forEach((p, i) => p.forEach((_, j) => { p[j] += (desiredPoints[i][j] - p[j]) * alpha; error += Math.abs(desiredPoints[i][j] - p[j]); }));
    const points = currentPoints.map(([x, y]) => [position.x + x * position.scale, position.y + y * position.scale]);
    polygon.setAttribute('points', polygonPoints(points));
    frame = 0;
    if (error > .02) frame = requestAnimationFrame(animate);
  }
  function setSlot(move) {
    slot = move;
    preview(move);
  }
  function follow(x, y) {
    pointer = { x, y };
    const matrix = board.getScreenCTM();
    const scale = screenScale(matrix);
    const threshold = Math.max(22, scale * .72);
    const m = model();
    let center = pointer;
    let best = null, nearest = Infinity;
    const candidates = m.moves.filter(move => move.type === m.type && move.rot === m.rotation);
    for (const move of candidates) {
      const candidate = moveCenter(move, matrix);
      const distance = Math.hypot(candidate.x - x, candidate.y - y);
      const same = slot && move.x === slot.x && move.y === slot.y && move.rot === slot.rot;
      const rank = distance - (same ? 9 : 0);
      if (distance < threshold * (same ? 1.35 : 1) && rank < nearest) {
        nearest = rank;
        best = move;
        center = candidate;
      }
    }
    const rect = board.getBoundingClientRect();
    if (y < rect.top || y > rect.bottom || x < rect.left || x > rect.right) {
      best = null;
      center = pointer;
    }
    goal = { x: center.x, y: center.y, scale };
    setSlot(best);
    shapePoints();
    wake();
  }
  function dockItem(dock, event, sideBySide) {
    // Split each gap at its midpoint so it belongs to the nearest slot.
    const coordinate = sideBySide ? event.clientY : event.clientX;
    const end = sideBySide ? 'bottom' : 'right';
    const start = sideBySide ? 'top' : 'left';
    const items = [...dock.querySelectorAll('.piece')];
    return items.find((item, i) => {
      const next = items[i + 1];
      if (!next) return true;
      const currentShape = item.querySelector('polygon').getBoundingClientRect();
      const nextShape = next.querySelector('polygon').getBoundingClientRect();
      return coordinate < (currentShape[end] + nextShape[start]) / 2;
    });
  }
  function pickFromDock(event, item, initial = false) {
    const type = Number(item?.dataset.type ?? -1);
    if (!model().hand[type]) return;
    if (type !== model().type || !floating) select(type);
    floating = true;
    overlay.classList.add('visible');
    shapePoints();
    if (initial) {
      const source = item.querySelector('polygon');
      const rect = source.getBoundingClientRect();
      const matrix = source.getScreenCTM();
      position = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, scale: Math.hypot(matrix.a, matrix.b) };
      currentPoints = desiredPoints.map(p => [...p]);
    }
    if (gesture.heldItem !== item) {
      gesture.heldItem = item;
      updateCorridor([event.clientX, event.clientY]);
    }
    reservePiece(type);
    setSlot(null);
    const [x, y] = pullPoint(event);
    pointer = { x, y };
    goal = { x, y, scale: screenScale(board.getScreenCTM()) };
    wake();
  }
  function down(event, source, dock = null) {
    if (!enabled() || gesture || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (source !== 'dock' && !floating) return;
    let pull, item;
    if (source === 'dock') {
      if (dock !== docks[model().player]) return;
      const rect = dock.getBoundingClientRect();
      const boardRect = board.getBoundingClientRect();
      const sideBySide = rect.right <= boardRect.left || rect.left >= boardRect.right;
      const start = sideBySide ? 'left' : 'top';
      const end = sideBySide ? 'right' : 'bottom';
      const forward = rect[start] < boardRect[start];
      pull = { sideBySide, direction: forward ? 1 : -1, edge: rect[forward ? end : start] };
      item = dockItem(dock, event, sideBySide);
      if (!item || !model().hand[Number(item.dataset.type)]) return;
    }
    event.preventDefault();
    const target = source === 'float' ? overlay : event.currentTarget;
    target.setPointerCapture(event.pointerId);
    gesture = {
      id: event.pointerId, source, dock, pull,
      startX: event.clientX, startY: event.clientY,
      pieceX: goal.x, pieceY: goal.y,
      moved: false, detached: source !== 'dock',
    };
    if (pull) pickFromDock(event, item, !floating);
  }
  function pullPoint(event) {
    const { sideBySide, direction } = gesture.pull;
    const offset = 90 * direction;
    return sideBySide ? [event.clientX + offset, event.clientY] : [event.clientX, event.clientY + offset];
  }
  function updateCorridor(origin) {
    const { sideBySide, direction } = gesture.pull;
    const {left, right, top, bottom} = board.querySelector('.board-cells').getBoundingClientRect();
    if (sideBySide) {
      const x = direction > 0 ? left : right;
      gesture.corridor = [origin, [x, top], [x, bottom]];
    } else {
      const y = direction > 0 ? top : bottom;
      gesture.corridor = [origin, [left, y], [right, y]];
    }
  }
  function aimingAtBoard(event) {
    const [origin, first, last] = gesture.corridor;
    const along = gesture.pull.sideBySide ? 0 : 1;
    const across = 1 - along;
    const point = [event.clientX, event.clientY];
    const progress = (point[along] - origin[along]) / (first[along] - origin[along]);
    if (progress <= 0 || progress > 1) return false;
    const min = origin[across] + (first[across] - origin[across]) * progress;
    const max = origin[across] + (last[across] - origin[across]) * progress;
    return point[across] >= min && point[across] <= max;
  }
  function move(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    if (event.currentTarget === gameScreen && gesture.source !== 'background') return;
    event.preventDefault();
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 6) gesture.moved = true;
    if (gesture.source === 'dock' && !gesture.detached) {
      const { sideBySide, direction, edge } = gesture.pull;
      const coordinate = sideBySide ? event.clientX : event.clientY;
      const boardEdge = gesture.corridor[1][sideBySide ? 0 : 1];
      if ((coordinate - edge) * direction > 25 || (coordinate - boardEdge) * direction >= 0) {
        gesture.detached = true;
      } else {
        const item = aimingAtBoard(event) ? gesture.heldItem : dockItem(gesture.dock, event, sideBySide);
        pickFromDock(event, item);
        return;
      }
    }
    if (gesture.moved) {
      if (gesture.source === 'dock') {
        follow(...pullPoint(event));
      } else {
        follow(
          gesture.pieceX + event.clientX - gesture.startX,
          gesture.pieceY + event.clientY - gesture.startY,
        );
      }
    }
  }
  function up(event) {
    if (!gesture || event.pointerId !== gesture.id) return;
    const done = gesture;
    gesture = null;
    if (event.type === 'pointercancel') return;
    if (!done.moved && (done.source === 'board' || done.source === 'float')) rotate();
  }
  function rotate() {
    if (!enabled() || !floating) return;
    orient((model().rotation + 1) % 6);
    follow(goal.x, goal.y);
  }
  function showMove(move) {
    floating = true;
    reservePiece(model().type);
    pointer = null;
    shapePoints();
    const matrix = board.getScreenCTM();
    const {x, y} = moveCenter(move, matrix);
    goal = { x, y, scale: screenScale(matrix) };
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
    overlay.classList.remove('visible');
    reservePiece(null);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }
  for (const dock of docks) dock.addEventListener('pointerdown', e => down(e, 'dock', dock));
  board.addEventListener('pointerdown', e => down(e, 'board'));
  polygon.addEventListener('pointerdown', e => down(e, 'float'));
  gameScreen.addEventListener('pointerdown', e => {
    if (e.target.closest('button, #board, .piece-display')) return;
    down(e, 'background');
  });
  for (const target of [...docks, board, overlay, gameScreen]) {
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
    target.addEventListener('lostpointercapture', e => { if (gesture?.id === e.pointerId) gesture = null; });
  }
  window.addEventListener('resize', () => {
    if (gesture?.heldItem && !gesture.detached) updateCorridor(gesture.corridor[0]);
    if (!floating) return;
    if (pointer) follow(pointer.x, pointer.y);
    else if (slot) showMove(slot);
  });
  return { reset, rotate, showMove };
}
