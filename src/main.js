import '@fontsource/gugi/latin-400.css';
import { shapes, cells, centers, regions, regionBonuses, placement, moves, penalty } from './engine.js';
import { createDock } from './dock.js';
import { createPieceDisplay, shapeColors } from './piece-display.js';
import { hexagonVertices } from './geometry.js';
import { BOARD_SCALE, boardPoint, screenPoint, screenScale } from './board-coordinates.js';
import { svg, svgPolygon } from './svg.js';
import { practiceBoards, createPracticeState, practiceWon, practiceOpening } from './practice.js';
import { createSounds } from './sounds.js';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
	navigator.serviceWorker.register('/sw.js').catch(console.warn);
}

const sounds = createSounds();

const $ = id => document.getElementById(id);
const storageKey = 'hexcite-pocket-v1';
const musicButtons = [...$('music-tracks').querySelectorAll('button')];
for (const button of musicButtons) {
	button.onclick = () => {
		for (const option of musicButtons) option.setAttribute('aria-pressed', option === button);
		sounds.setMusicTrack(Number(button.value), {playNow: true});
	};
}
let state;
let selected = 0;
let heldType = null;
let rotation = 0;
let preview = null;
let legal = [];
let busy = false;
let transitioning = false;
let scoring = null;
let computerTimer;
const progressKey = 'hexcite-practice-progress-v1';
let completed = new Set();
try {
	const saved = JSON.parse(localStorage.getItem(progressKey));
	if (Array.isArray(saved)) completed = new Set(saved.filter(n => Number.isInteger(n) && n >= 1 && n <= 50));
} catch { /* Ignore invalid practice progress. */ }

const boardPolygon = (vertices, attributes) => svgPolygon(vertices.map(boardPoint), attributes);

const gameScreen = $('game-screen');
const boardElement = $('board');
const docks = [$('player-1-pieces'), $('player-2-pieces')];
const playerPieces = docks.map((container, player) => createPieceDisplay(container.firstElementChild, {
	onSelect: type => {
		if (state.turn !== player || busy || state.over) return;
		sounds.play('select');
		selected = type;
		rotation = 0;
		const move = legal.find(move => move.type === type);
		render();
		if (move) {
			rotation = move.rot;
			dock.showMove(move);
		}
	},
}));
const dockResize = new ResizeObserver(() => {
	if (gameScreen.hidden) return;
	const matrix = boardElement.getScreenCTM();
	if (!matrix) return;
	const scale = screenScale(matrix);
	playerPieces.forEach(display => display.fit(scale));
});
for (const element of [boardElement, ...docks]) dockResize.observe(element);

function save() {
	localStorage.setItem(storageKey, JSON.stringify(state));
}

function init(mode, number = 1) {
	const hands = Array.from({length: 2}, () => {
		const hand = [2, 2, 2, 1, 2, 1, 1];
		for (let i = 0; i < 3; i++) hand[Math.floor(Math.random() * shapes.length)]++;
		return hand;
	});
	state = {
		board: Array(cells.length).fill(0),
		hands,
		scores: [0, 0],
		turn: 0,
		placed: [],
		mode,
		over: false,
	};
	if (mode === 'practice') state = createPracticeState(number);
	selected = 0;
	rotation = 0;
	busy = false;
	save();
	refresh();
}

function refresh() {
	clearTimeout(computerTimer);
	dock.reset();
	legal = state.over ? [] : moves(state.board, state.hands[state.turn]);
	if (!state.over && !legal.length && !moves(state.board, state.hands[1 - state.turn]).length) {
		finishGame();
		return;
	}
	if (!state.hands[state.turn][selected]) selected = state.hands[state.turn].findIndex(n => n > 0);
	preview = null;
	busy = !state.over && state.mode !== 'local' && state.turn === 1;
	render();
	if (busy) computerTimer = setTimeout(computerMove, 500);
}

async function finishGame() {
	state.over = true;
	const deductions = state.hands.map(hand => -penalty(hand));
	state.scores = state.scores.map((score, player) => score + deductions[player]);
	// Persist final scores once; reloading must never apply penalties a second time.
	save();
	scoring = {points: deductions};
	busy = true;
	preview = null;
	render();
	try {
		// A resumed game can reach this point before its screen becomes visible.
		await new Promise(requestAnimationFrame);
		for (const [player, hand] of state.hands.entries()) {
			for (const [type, count] of hand.entries()) {
				for (let piece = 0; piece < count; piece++) {
					const shape = docks[player].querySelector(`[data-type="${type}"] polygon`);
					const box = shape.getBoundingClientRect();
					const origin = {x: box.left + box.width / 2, y: box.top + box.height / 2};
					await awardPoints([], -shapes[type].v.length * 5, player, origin);
					hand[type]--;
					renderDocks();
				}
			}
		}
		save();
	} finally {
		scoring = null;
		if (practiceWon(state)) {
			completed.add(state.practiceNumber);
			localStorage.setItem(progressKey, JSON.stringify([...completed]));
		}
		refresh();
		sounds.play(state.scores[0] === state.scores[1] ? 'draw'
			: state.mode === 'local' || state.scores[0] > state.scores[1] ? 'win' : 'lose');
	}
}

function computerMove() {
	if ($('game-screen').hidden || state.over || scoring) return;
	if (!legal.length) return pass();
	const opening = practiceOpening(state, legal);
	if (opening) return commit(opening);
	const ranked = legal.map(move => ({move, value: move.score + move.ids.length * .8 + Math.random() * 3}));
	ranked.sort((a, b) => b.value - a.value);
	commit(ranked[0].move);
}

function render() {
	const practice = state.mode === 'practice';
	const names = state.mode !== 'local' ? ['You', 'Computer'] : ['Player 1', 'Player 2'];
	$('practice-status').hidden = !practice;
	$('practice-status').textContent = practice ? `${state.practiceNumber} / ${practiceBoards.length}` : '';
	$('retry').hidden = !practice || state.over;
	$('retry').disabled = !!scoring;
	$('menu').disabled = !!scoring;
	$('result-title').textContent = practice ? `Practice ${state.practiceNumber} / ${practiceBoards.length}` : 'Match Complete';
	$('play-again').textContent = practice ? practiceWon(state) ? state.practiceNumber < practiceBoards.length ? 'Next Board' : 'Choose a Board' : 'Try Again' : 'Play Again';
	state.scores.forEach((score, player) => {
		const scoreElement = $(`player-${player + 1}-score`);
		scoreElement.parentElement.classList.toggle('inactive', !state.over && state.turn !== player);
		scoreElement.innerHTML = `
    <div class="score ${state.turn === player && !state.over ? 'active' : ''}">
      <div class="name">${player + 1}P</div>
      <strong data-score-player="${player}">${score - (scoring?.points[player] || 0)}</strong>
    </div>`;
	});
	$('result').hidden = !state.over || !!scoring;
	$('result-message').textContent = state.over
		? practice ? practiceWon(state) ? state.practiceNumber === practiceBoards.length ? 'Final board cleared!' : 'Board cleared!' : 'Beat the computer to clear this board.' : state.scores[0] === state.scores[1] ? 'Match drawn' : names[state.scores[0] > state.scores[1] ? 0 : 1] + ' wins!'
		: '';

	renderDocks();

	draw();
}

function renderDocks() {
	playerPieces.forEach((display, player) => display.render({
		hand: state.hands[player].map((count, type) => count - (player === state.turn && type === heldType ? 1 : 0)),
		disabled: busy || state.over || state.turn !== player,
	}));
}

function renderAction() {
	const action = state.over ? null : !legal.length ? 'pass' : preview ? 'place' : state.mode === 'practice' ? null : 'hint';
	const focused = document.activeElement;
	for (const id of ['hint', 'place', 'pass']) {
		$(id).hidden = id !== action;
		$(id).disabled = busy || state.over || id !== action;
	}
	if (focused?.hidden && ['hint', 'place', 'pass'].includes(focused.id)) {
		if (action && !busy) $(action).focus({preventScroll: true});
	}
}

function draw() {
	const board = $('board');
	board.replaceChildren();
	const defs = svg('defs', {});
	const mix = svg('pattern', {id: 'center-mix', width: 10, height: 10, patternUnits: 'userSpaceOnUse'});
	mix.append(svg('rect', {width: 10, height: 10, class: 'mix-sky'}));
	mix.append(svg('path', {d: 'M0 0h5v5H0z M5 5h5v5H5z', class: 'mix-lilac'}));
	defs.append(mix);
	board.append(defs);
	const grid = svg('g', {class: 'board-cells'});
	board.append(grid);
	cells.forEach(cell => {
		const regionClass = cell.r === 0 ? 'center-region' : regionBonuses[cell.r] === 30 ? 'lilac-region' : 'sky-region';
		const polygon = boardPolygon(cell.v, {class: `cell ${regionClass}`});
		grid.append(polygon);
	});
	centers.forEach((center, region) => {
		const vertices = hexagonVertices(center);
		board.append(boardPolygon(vertices, {class: 'zone'}));
		if (region) {
			const [x, y] = boardPoint(center);
			const distance = Math.hypot(x, y);
			const dots = regionBonuses[region] / 10;
			const marker = svg('g', {class: `bonus-dots ${regionBonuses[region] === 30 ? 'lilac-region' : 'sky-region'}`});
			const title = svg('title', {});
			title.textContent = `${dots} ${dots === 1 ? 'dot' : 'dots'} × 10 points on completion`;
			marker.append(title);
			for (let dot = 0; dot < dots; dot++) {
				const offset = (dot - (dots - 1) / 2) * 12;
				marker.append(svg('circle', {
					cx: x * 1.57 - y / distance * offset,
					cy: y * 1.57 + x / distance * offset,
					r: 3.5,
				}));
			}
			board.append(marker);
		}
	});
	for (const piece of state.placed) {
		board.append(boardPolygon(piece.v, {fill: '#fff', class: 'placed'}));
	}
	renderAction();
}

async function animatePoints(move, player, origin) {
	const target = document.querySelector(`[data-score-player="${player}"]`);
	if (!target) return;
	if (!origin) {
		const matrix = $('board').getScreenCTM();
		if (!matrix) return;
		// The board cells have equal area, so their mean gives the piece's centroid.
		const center = move.ids.reduce((sum, id) => {
			const [x, y] = boardPoint(cells[id].p);
			return [sum[0] + x / move.ids.length, sum[1] + y / move.ids.length];
		}, [0, 0]);
		origin = screenPoint(center, matrix);
	}
	const label = document.createElement('span');
	label.className = 'placement-points';
	label.textContent = `${move.score > 0 ? '+' : ''}${move.score}`;
	Object.assign(label.style, {left: `${origin.x}px`, top: `${origin.y}px`});
	document.body.append(label);
	try {
		await label.animate([
			{transform: 'translate(-50%, -50%) translateY(0)'},
			{transform: 'translate(-50%, -50%) translateY(-10px)', offset: .5, easing: 'ease-in'},
			{transform: 'translate(-50%, -50%) translateY(0)'},
		], {duration: 360, easing: 'ease-out'}).finished;
		playTurnSound('score', player);
		const destination = target.getBoundingClientRect();
		const dx = destination.left + destination.width / 2 - origin.x;
		const dy = destination.top + destination.height / 2 - origin.y;
		await label.animate([
			{transform: 'translate(-50%, -50%) scale(1)', opacity: 1},
			{transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(.65)`, opacity: .2},
		], {duration: 600, easing: 'cubic-bezier(.45,0,.7,1)', fill: 'forwards'}).finished;
	} finally {
		label.remove();
	}
}

function playTurnSound(name, player) {
	if (state.over || state.mode !== 'practice' || player === 0) sounds.play(name);
}

async function animateBonus(region, player) {
	playTurnSound('bonus', player);
	const effect = svg('g', {class: 'bonus-rainbow'});
	const defs = svg('defs', {});
	const clip = svg('clipPath', {id: `bonus-clip-${region}`});
	clip.append(boardPolygon(hexagonVertices(centers[region])));
	const gradient = svg('linearGradient', {id: `bonus-rainbow-${region}`});
	['#ff1744', '#ff9100', '#ffea00', '#00e676', '#00b0ff', '#651fff', '#f500f5'].forEach((color, index) => {
		gradient.append(svg('stop', {offset: `${index / 6 * 100}%`, 'stop-color': color}));
	});
	defs.append(clip, gradient);
	const [x, y] = boardPoint(centers[region]);
	const bandWidth = BOARD_SCALE * 4;
	const band = svg('rect', {
		x: x - bandWidth / 2,
		y: y - bandWidth / 2,
		width: bandWidth,
		height: bandWidth,
		fill: `url(#bonus-rainbow-${region})`,
	});
	const clipped = svg('g', {'clip-path': `url(#bonus-clip-${region})`});
	clipped.append(band);
	effect.append(defs, clipped);
	$('board').append(effect);
	try {
		await band.animate([
			{transform: `translateX(${-bandWidth}px)`, opacity: 1},
			{transform: 'translateX(0)', opacity: 1, offset: .5},
			{transform: `translateX(${bandWidth}px)`, opacity: 1},
		], {duration: 1000, easing: 'ease-in-out'}).finished;
	} finally {
		effect.remove();
	}
}

async function awardPoints(ids, amount, player, origin) {
	if (!amount) return;
	await animatePoints({ids, score: amount}, player, origin);
	scoring.points[player] -= amount;
	const target = document.querySelector(`[data-score-player="${player}"]`);
	target.textContent = state.scores[player] - scoring.points[player];
	target.animate([
		{transform: 'scale(1)'}, {transform: 'scale(1.2)'}, {transform: 'scale(1)'},
	], {duration: 240, easing: 'ease-out'});
}

async function commit(move) {
	if (state.over || scoring) return;
	const valid = placement(state.board, move.type, move.rot, move.x, move.y);
	if (!valid) return;
	const player = state.turn;
	playTurnSound('place', player);
	dock.reset();
	valid.ids.forEach(id => state.board[id] = player + 1);
	state.hands[player][valid.type]--;
	state.scores[player] += valid.score;
	state.placed.push({...valid, player});
	state.turn = 1 - player;
	if (state.mode === 'practice') state.turnsPlayed++;
	save();
	scoring = {points: [0, 0]};
	scoring.points[player] = valid.score;
	busy = true;
	preview = null;
	render();
	try {
		await awardPoints(valid.ids, valid.score - valid.bonus, player);
		for (const {region, points} of valid.completedRegions) {
			await animateBonus(region, player);
			await awardPoints(regions[region], points, player);
		}
	} finally {
		scoring = null;
		refresh();
	}
}

function pass() {
	if (legal.length || state.over || scoring) return;
	playTurnSound('pass', state.turn);
	state.turn = 1 - state.turn;
	if (state.mode === 'practice') state.turnsPlayed++;
	save();
	refresh();
}

const dock = createDock({
	docks, board: boardElement, gameScreen,
	reserve: type => {
		heldType = type;
		renderDocks();
	},
	model: () => ({
		player: state.turn,
		type: selected,
		rotation,
		moves: legal,
		hand: state.hands[state.turn],
		color: shapeColors[selected],
		busy,
		over: state.over,
		hidden: $('game-screen').hidden,
	}),
	select: type => {
		sounds.play('select');
		selected = type;
		rotation = 0;
		preview = null;
		render();
	},
	orient: value => {
		sounds.play('rotate');
		rotation = value;
	},
	preview: move => {
		preview = move;
		renderAction();
	},
});

$('place').onclick = () => {
	if (preview && !busy) commit(preview);
};
$('hint').onclick = () => {
	const preferred = legal.filter(move => move.type === selected);
	const best = practiceOpening(state, legal) || [...(preferred.length ? preferred : legal)].sort((a,
		b) => b.score - a.score || b.ids.length - a.ids.length)[0];
	if (!best) return;
	sounds.play('hint');
	selected = best.type;
	rotation = best.rot;
	render();
	dock.showMove(best);
};
$('pass').onclick = pass;
$('play-again').onclick = () => {
	if (!state.over || scoring) return;
	if (practiceWon(state) && state.practiceNumber === practiceBoards.length) return showMenu(true);
	init(state.mode, (state.practiceNumber || 1) + (practiceWon(state) ? 1 : 0));
	$(state.mode === 'practice' ? 'retry' : 'hint').focus({preventScroll: true});
};
$('retry').onclick = () => {
	if (!scoring) init('practice', state.practiceNumber);
};
function renderPracticeMenu() {
	$('practice-progress').textContent = `${completed.size} of ${practiceBoards.length} boards cleared`;
	$('practice-boards').replaceChildren(...practiceBoards.map(({number}) => {
		const button = document.createElement('button');
		button.textContent = `${number}${completed.has(number) ? ' ✓' : ''}`;
		button.className = completed.has(number) ? 'cleared' : '';
		button.setAttribute('aria-label', `Practice board ${number}${completed.has(number) ? ', cleared' : ''}`);
		button.onclick = () => startGame('practice', false, number);
		return button;
	}));
}
async function showMenu(practice = false) {
	if (scoring || transitioning) return;
	transitioning = true;
	clearTimeout(computerTimer);
	dock.reset();
	const game = $('game-screen');
	const title = $('title-screen');
	const outgoing = game.hidden ? title : game;
	outgoing.inert = true;
	title.inert = true;
	const fadeOut = outgoing.animate([{opacity: 1}, {opacity: 0}], {
		duration: 220,
		easing: 'ease-in',
		fill: 'forwards',
	});
	await fadeOut.finished;
	game.hidden = true;
	game.inert = true;
	title.hidden = false;
	$('main-menu').hidden = practice;
	$('practice-menu').hidden = !practice;
	$('resume').hidden = !state || state.over;
	renderPracticeMenu();
	const fadeIn = title.animate([{opacity: 0}, {opacity: 1}], {
		duration: 320,
		delay: 100,
		fill: 'backwards',
		easing: 'ease-out',
	});
	fadeOut.cancel();
	await fadeIn.finished;
	title.inert = false;
	transitioning = false;
	(practice ? $('practice-back') : $('one-player')).focus({preventScroll: true});
}
$('menu').onclick = () => showMenu(state.mode === 'practice');
$('practice').onclick = () => showMenu(true);
$('practice-back').onclick = () => showMenu(false);
document.addEventListener('keydown', event => {
	if ($('game-screen').hidden || transitioning) return;
	if (event.key.toLowerCase() === 'r' && !busy && !state.over) dock.rotate();
});

async function startGame(mode, resume = false, number = 1) {
	if (transitioning) return;
	sounds.play('start');
	transitioning = true;
	const buttons = document.querySelectorAll('#title-screen button');
	buttons.forEach(button => button.disabled = true);
	const title = $('title-screen');
	await title.animate([{opacity: 1}, {opacity: 0}], {
		duration: 220,
		easing: 'ease-in',
		fill: 'forwards',
	}).finished;
	title.hidden = true;
	title.getAnimations().forEach(animation => animation.cancel());
	if (resume) refresh();
	else init(mode, number);
	const game = $('game-screen');
	game.hidden = false;
	game.inert = false;
	await game.animate([{opacity: 0}, {opacity: 1}], {
		duration: 320,
		delay: 100,
		fill: 'backwards',
		easing: 'ease-out',
	}).finished;
	transitioning = false;
	document.querySelector('.controls button:not([hidden]):not(:disabled)')?.focus({preventScroll: true});
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
renderPracticeMenu();
// Prevent native selection and long-press UI from interrupting game gestures.
for (const type of ['contextmenu', 'selectstart', 'dragstart']) {
	document.addEventListener(type, event => event.preventDefault(), {capture: true});
}
