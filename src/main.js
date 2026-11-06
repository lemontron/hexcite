import '@fontsource/gugi/latin-400.css';
import { shapes, cells, centers, regions, regionBonuses, placement, moves, penalty } from './engine.js';
import { createDock } from './dock.js';
import { createPieceDisplay, shapeColors } from './piece-display.js';
import { hexagonVertices } from './geometry.js';
import { BOARD_SCALE, boardPoint, svgPoints, screenPoint } from './board-coordinates.js';

const $ = id => document.getElementById(id);
const storageKey = 'hexcite-pocket-v1';
let state;
let selected = 0;
let rotation = 0;
let preview = null;
let legal = [];
let busy = false;
let transitioning = false;
let scoring = null;

function svg(tag, attributes) {
	const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
	for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
	return element;
}

const docks = [$('player-1-pieces'), $('player-2-pieces')];
const playerPieces = docks.map((container, player) => createPieceDisplay(container, {
	onSelect: type => {
		if (state.turn !== player || busy || state.over) return;
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
	const ranked = legal.map(move => ({move, value: move.score + move.ids.length * .8 + Math.random() * 3}));
	ranked.sort((a, b) => b.value - a.value);
	commit(ranked[0].move);
}

function render() {
	const names = state.mode === 'ai' ? ['You', 'Computer'] : ['Player 1', 'Player 2'];
	state.scores.forEach((score, player) => {
		const scoreElement = $(`player-${player + 1}-score`);
		scoreElement.parentElement.classList.toggle('inactive', !state.over && state.turn !== player);
		scoreElement.innerHTML = `
    <div class="score ${state.turn === player && !state.over ? 'active' : ''}">
      <div class="name">${player + 1}P</div>
      <strong data-score-player="${player}">${score - (scoring?.player === player ? scoring.points : 0)}</strong>
    </div>`;
	});
	$('result').hidden = !state.over;
	$('result-message').textContent = state.over
		? state.scores[0] === state.scores[1] ? 'Match drawn' : names[state.scores[0] > state.scores[1] ? 0 : 1] + ' wins!'
		: '';

	playerPieces.forEach((display, player) => display.render({
		hand: state.hands[player],
		disabled: busy || state.over || state.turn !== player,
	}));

	draw();
}

function renderAction() {
	const action = state.over ? null : !legal.length ? 'pass' : preview ? 'place' : 'hint';
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
	cells.forEach(cell => {
		const regionClass = cell.r === 0 ? 'center-region' : regionBonuses[cell.r] === 30 ? 'lilac-region' : 'sky-region';
		const polygon = svg('polygon', {points: svgPoints(cell.v), class: `cell ${regionClass}`});
		board.append(polygon);
	});
	centers.forEach((center, region) => {
		const vertices = hexagonVertices(center);
		board.append(svg('polygon', {points: svgPoints(vertices), class: 'zone'}));
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
		board.append(svg('polygon', {points: svgPoints(piece.v), fill: '#fff', class: 'placed'}));
	}
	renderAction();
}

async function animatePoints(move, player) {
	const board = $('board');
	const matrix = board.getScreenCTM();
	const target = document.querySelector(`[data-score-player="${player}"]`);
	if (!matrix || !target) return;
	// The board cells have equal area, so their mean gives the piece's centroid.
	const center = move.ids.reduce((sum, id) => {
		const [x, y] = boardPoint(cells[id].p);
		return [sum[0] + x / move.ids.length, sum[1] + y / move.ids.length];
	}, [0, 0]);
	const origin = screenPoint(center, matrix);
	const label = document.createElement('span');
	label.className = 'placement-points';
	label.textContent = `+${move.score}`;
	Object.assign(label.style, {left: `${origin.x}px`, top: `${origin.y}px`});
	document.body.append(label);
	try {
		await label.animate([
			{transform: 'translate(-50%, -50%) translateY(0)'},
			{transform: 'translate(-50%, -50%) translateY(-10px)', offset: .5, easing: 'ease-in'},
			{transform: 'translate(-50%, -50%) translateY(0)'},
		], {duration: 360, easing: 'ease-out'}).finished;
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

async function animateBonus(region) {
	const effect = svg('g', {class: 'bonus-rainbow'});
	const defs = svg('defs', {});
	const clip = svg('clipPath', {id: `bonus-clip-${region}`});
	clip.append(svg('polygon', {points: svgPoints(hexagonVertices(centers[region]))}));
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

async function awardPoints(ids, amount, player) {
	if (!amount) return;
	await animatePoints({ids, score: amount}, player);
	scoring.points -= amount;
	const target = document.querySelector(`[data-score-player="${player}"]`);
	target.textContent = state.scores[player] - scoring.points;
	target.animate([
		{transform: 'scale(1)'}, {transform: 'scale(1.2)'}, {transform: 'scale(1)'},
	], {duration: 240, easing: 'ease-out'});
}

async function commit(move) {
	if (state.over || scoring) return;
	const valid = placement(state.board, move.type, move.rot, move.x, move.y);
	if (!valid) return;
	dock.reset();
	const player = state.turn;
	valid.ids.forEach(id => state.board[id] = player + 1);
	state.hands[player][valid.type]--;
	state.scores[player] += valid.score;
	state.placed.push({...valid, player});
	state.turn = 1 - player;
	save();
	scoring = {player, points: valid.score};
	busy = true;
	preview = null;
	render();
	try {
		await awardPoints(valid.ids, valid.score - valid.bonus, player);
		for (const {region, points} of valid.completedRegions) {
			await animateBonus(region);
			await awardPoints(regions[region], points, player);
		}
	} finally {
		scoring = null;
		refresh();
	}
}

function pass() {
	if (legal.length || state.over || scoring) return;
	state.turn = 1 - state.turn;
	save();
	refresh();
}

const dock = createDock({
	docks, board: $('board'),
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
		selected = type;
		rotation = 0;
		preview = null;
		render();
	},
	orient: value => {
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
	const best = [...(preferred.length ? preferred : legal)].sort((a,
		b) => b.score - a.score || b.ids.length - a.ids.length)[0];
	if (!best) return;
	selected = best.type;
	rotation = best.rot;
	render();
	dock.showMove(best);
};
$('pass').onclick = pass;
$('play-again').onclick = () => {
	if (!state.over || scoring) return;
	init(state.mode);
	$('hint').focus({preventScroll: true});
};
document.addEventListener('keydown', event => {
	if ($('game-screen').hidden || transitioning) return;
	if (event.key.toLowerCase() === 'r' && !busy && !state.over) dock.rotate();
});

async function startGame(mode, resume = false) {
	if (transitioning) return;
	transitioning = true;
	const buttons = document.querySelectorAll('.start-tile,.resume');
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
	else init(mode);
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
// Prevent native selection and long-press UI from interrupting game gestures.
for (const type of ['contextmenu', 'selectstart', 'dragstart']) {
	document.addEventListener(type, event => event.preventDefault(), {capture: true});
}
