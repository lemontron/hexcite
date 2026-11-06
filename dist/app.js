import { shapes, cells, centers, regions, xy, placement, moves, penalty } from './engine.js';
import { createDock } from './dock.js';

const $ = id => document.getElementById(id);
const colors = ['#0078d4', '#e66b25'];
const storageKey = 'hexcite-pocket-v1';
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let state;
let selected = 0;
let rotation = 0;
let preview = null;
let legal = [];
let busy = false;
let transitioning = false;

function svg(tag, attributes) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

function points(vertices, scale = 39) {
  return vertices.map(vertex => xy(vertex).map(n => n * scale).join(',')).join(' ');
}

// A common viewBox preserves the relative sizes of all seven pieces.
function pieceIcon(shape, player) {
  const vertices = shape.v.map(xy);
  const xs = vertices.map(p => p[0]);
  const ys = vertices.map(p => p[1]);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2 - 2.2;
  const y = (Math.min(...ys) + Math.max(...ys)) / 2 - 1.9;
  return `<svg viewBox="${x} ${y} 4.4 3.8" aria-hidden="true"><polygon points="${vertices.map(p => p.join(',')).join(' ')}" fill="${colors[player]}"/></svg>`;
}

function renderPieceDisplay(container, player, interactive = false) {
  container.replaceChildren();
  container.style.setProperty('--piece-color', colors[player]);
  shapes.forEach((shape, type) => {
    const count = state.hands[player][type];
    const item = document.createElement(interactive ? 'button' : 'div');
    item.className = 'piece' + (!count ? ' empty' : '') + (interactive && selected === type ? ' selected' : '');
    item.setAttribute('aria-label', `${shape.name}, ${count} remaining`);
    item.innerHTML = `<span class="count">×${count}</span>${pieceIcon(shape, player)}`;
    if (interactive) {
      item.disabled = !count || busy || state.over;
      item.setAttribute('aria-pressed', selected === type);
      item.dataset.type = type;
      item.onclick = event => {
        if (event.detail !== 0) return;
        selected = type;
        rotation = 0;
        const move = legal.find(move => move.type === type);
        render();
        if (move) { rotation = move.rot; dock.showMove(move); }
      };
    } else {
      item.setAttribute('role', 'img');
    }
    container.append(item);
  });
}

function save() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function init(mode) {
  const hand = [2, 2, 2, 1, 2, 1, 1];
  for (let i = 0; i < 3; i++) hand[Math.floor(Math.random() * shapes.length)]++;
  state = {
    board: Array(cells.length).fill(0),
    hands: [[...hand], [...hand]],
    scores: [0, 0],
    turn: 0,
    placed: [],
    mode,
    over: false,
  };
  selected = 0;
  rotation = 0;
  busy = false;
  save();
  refresh();
}

function refresh() {
  dock.reset();
  legal = state.over ? [] : moves(state.board, state.hands[state.turn]);
  if (!state.over && !legal.length && !moves(state.board, state.hands[1 - state.turn]).length) {
    state.over = true;
    state.scores = state.scores.map((score, player) => score - penalty(state.hands[player]));
    save();
  }
  if (!state.hands[state.turn][selected]) selected = state.hands[state.turn].findIndex(n => n > 0);
  preview = null;
  busy = !state.over && state.mode === 'ai' && state.turn === 1;
  render();
  if (busy) setTimeout(computerMove, 500);
}

function computerMove() {
  if (!legal.length) return pass();
  const ranked = legal.map(move => ({ move, value: move.score + move.ids.length * .8 + Math.random() * 3 }));
  ranked.sort((a, b) => b.value - a.value);
  commit(ranked[0].move);
}

function render() {
  const names = state.mode === 'ai' ? ['You', 'Computer'] : ['Player 1', 'Player 2'];
  $('scores').innerHTML = state.scores.map((score, player) => `
    <div class="score ${state.turn === player && !state.over ? 'active' : ''}">
      <div class="name"><i class="dot ${player ? 'coral' : ''}"></i>${names[player]}</div>
      <strong>${score}</strong>
    </div>`).join('');
  $('result').hidden = !state.over;
  $('result').textContent = state.over
    ? state.scores[0] === state.scores[1] ? 'Match drawn' : names[state.scores[0] > state.scores[1] ? 0 : 1] + ' wins!'
    : '';

  renderPieceDisplay($('pieces'), state.turn, true);
  renderPieceDisplay($('opponent-pieces'), state.mode === 'ai' ? 1 : 1 - state.turn);

  $('pass').disabled = !!legal.length || state.over || busy;
  $('hint').disabled = busy || state.over || !legal.length;
  $('rotate').disabled = busy || state.over;
  draw();
}

function draw() {
  const board = $('board');
  board.replaceChildren();
  cells.forEach(cell => {
    const polygon = svg('polygon', { points: points(cell.v), class: 'cell' });
    board.append(polygon);
  });
  centers.forEach((center, region) => {
    const vertices = [[2, 0], [0, 2], [-2, 2], [-2, 0], [0, -2], [2, -2]].map(p => [p[0] + center[0], p[1] + center[1]]);
    board.append(svg('polygon', { points: points(vertices), class: 'zone' }));
    if (region && !regions[region].some(id => state.board[id])) {
      const [x, y] = xy(center);
      const label = svg('text', { x: x * 39, y: y * 39 + 4, class: 'zone-label' });
      label.textContent = '+30';
      board.append(label);
    }
  });
  for (const piece of state.placed) {
    board.append(svg('polygon', { points: points(piece.v), fill: colors[piece.player], class: 'placed' }));
  }
  $('place').disabled = !preview || state.over || busy;
}

function commit(move) {
  if (state.over) return;
  const valid = placement(state.board, move.type, move.rot, move.x, move.y);
  if (!valid) return;
  dock.reset();
  const player = state.turn;
  valid.ids.forEach(id => state.board[id] = player + 1);
  state.hands[player][valid.type]--;
  state.scores[player] += valid.score;
  state.placed.push({ ...valid, player });
  state.turn = 1 - player;
  save();
  refresh();
}

function pass() {
  if (legal.length || state.over) return;
  state.turn = 1 - state.turn;
  save();
  refresh();
}

const dock = createDock({
  dock: $('pieces'), board: $('board'), reducedMotion,
  model: () => ({ type: selected, rotation, moves: legal, hand: state.hands[state.turn], color: colors[state.turn], busy, over: state.over, hidden: $('game-screen').hidden }),
  select: type => { selected = type; rotation = 0; preview = null; render(); },
  orient: value => { rotation = value; },
  preview: move => { preview = move; $('place').disabled = !move || busy || state.over; },
});

$('place').onclick = () => { if (preview && !busy) commit(preview); };
$('rotate').onclick = () => dock.rotate();
$('hint').onclick = () => {
  const preferred = legal.filter(move => move.type === selected);
  const best = [...(preferred.length ? preferred : legal)].sort((a, b) => b.score - a.score || b.ids.length - a.ids.length)[0];
  if (!best) return;
  selected = best.type;
  rotation = best.rot;
  render();
  dock.showMove(best);
};
$('pass').onclick = pass;
document.addEventListener('keydown', event => {
  if ($('game-screen').hidden || transitioning) return;
  if (event.key.toLowerCase() === 'r' && !$('rotate').disabled) $('rotate').click();
});

async function startGame(mode, resume = false) {
  if (transitioning) return;
  transitioning = true;
  const buttons = document.querySelectorAll('.start-tile,.resume');
  buttons.forEach(button => button.disabled = true);
  const title = $('title-screen');
  if (!reducedMotion()) {
    await title.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' }).finished;
  }
  title.hidden = true;
  title.getAnimations().forEach(animation => animation.cancel());
  if (resume) refresh();
  else init(mode);
  const game = $('game-screen');
  game.hidden = false;
  game.inert = false;
  if (!reducedMotion()) {
    await game.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: 100, fill: 'backwards', easing: 'ease-out' }).finished;
  }
  transitioning = false;
  $('rotate').focus({ preventScroll: true });
  buttons.forEach(button => button.disabled = false);
}

try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved?.board.length === cells.length) state = saved;
} catch { /* Start a fresh match if saved data is unavailable. */ }
if (state && !state.over) $('resume').hidden = false;
$('one-player').onclick = () => startGame('ai');
$('two-player').onclick = () => startGame('local');
$('resume').onclick = () => startGame(state.mode, true);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

// Prevent native selection and long-press UI from interrupting game gestures.
for (const type of ['contextmenu', 'selectstart', 'dragstart']) {
  document.addEventListener(type, event => event.preventDefault(), { capture: true });
}
